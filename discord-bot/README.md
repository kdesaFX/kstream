# kdesa.stream Discord support bot

Supabase Edge Function + slash commands for tickets, update embeds, and one-shot server setup. A small gateway script keeps presence online and grants **Member** when someone joins.

## Add the bot (admin)

Open this link, pick your server, authorize:

**https://discord.com/api/oauth2/authorize?client_id=1536251834203770941&permissions=8&scope=bot%20applications.commands**

(`Administrator` so it can create channels/categories during setup. You can lower permissions later.)

## Discord Developer Portal (required for auto-Member)

**Bot → Privileged Gateway Intents → enable Server Members Intent.**

Without that, joiners will not get **Member** automatically.

## Security

Your **bot token** and **client secret** were visible in chat/screenshots. After setup:

1. [Developer Portal](https://discord.com/developers/applications/1536251834203770941) → **Bot** → **Reset Token**
2. **OAuth2** → **Reset Secret**
3. Put the new values in Supabase secrets only — never commit them.

## Supabase config (Vault)

Project: `khplnaovkxvzhbimuvzn`

Secrets live in **Supabase Vault** (not git). The edge function reads them via `discord_bot_setting` RPC.

Local scripts read **`discord-bot/.env`** (gitignored). Do not put the token on the CLI.

| Name | Purpose |
|------|---------|
| `DISCORD_BOT_TOKEN` | Bot token from Developer Portal |
| `DISCORD_PUBLIC_KEY` | Interactions public key |
| `DISCORD_GUILD_ID` | Set automatically by setup |
| `DISCORD_TICKET_CATEGORY_ID` | Set by `/setup-server` |
| `DISCORD_UPDATES_CHANNEL_ID` | Set by setup |
| `DISCORD_WELCOME_CHANNEL_ID` | Set by setup |
| `DISCORD_RULES_CHANNEL_ID` | Set by setup |
| `DISCORD_SUPPORT_CHANNEL_ID` | Set by setup |
| `DISCORD_MEMBER_ROLE_ID` | **Member** role (safe perms; auto on join) |
| `DISCORD_UPDATES_ROLE_ID` | Opt-in **Updates** ping role |
| `DISCORD_CLOSED_TICKET_CATEGORY_ID` | Closed tickets category |

Update a secret in SQL editor:

```sql
select public.discord_bot_upsert_setting('DISCORD_BOT_TOKEN', 'your_new_token');
```

## Discord Developer Portal — Interactions URL

```
https://khplnaovkxvzhbimuvzn.supabase.co/functions/v1/discord-bot
```

Save — Discord will send a PING to verify the endpoint.

## Roles

| Role | Permissions | How you get it |
|------|-------------|----------------|
| **Member** | None (label only) | Automatic on join (gateway script) |
| **Updates** | None, mentionable | Tap **Update pings** on welcome |

Legacy **Signal** is renamed to **Member** on setup / gateway start.

Put the **bot’s role above Member and Updates** in Server Settings → Roles or assigns fail.

## Auto-Member + presence (keep running)

```bash
node discord-bot/scripts/set-bot-presence.mjs
```

Token is loaded from `discord-bot/.env`. This process must stay online for:
- custom status / “online”
- granting **Member** on `GUILD_MEMBER_ADD`

Optional env: `DISCORD_MEMBER_ROLE_ID`, `DISCORD_GUILD_ID`.

## Finish setup

```bash
node discord-bot/scripts/complete-setup.mjs
```

Then in Discord run **`/setup-server`** (Administrator). It creates channels, **Member** + **Updates** roles, and refreshes welcome/support embeds.

Refresh embeds only:

```bash
node discord-bot/scripts/refresh-embeds.mjs
```

## Commands

| Command | Who | What |
|---------|-----|------|
| `/ticket [subject]` | Anyone | Opens a private ticket channel |
| `/ticket-close` | Opener or staff | Closes the ticket channel |
| `/update` | Staff/admin | Posts an embed to `#updates` |
| `/setup-server` | Admin | Channels, roles, starter embeds |
| `/scan-channel` | Staff | Index links from a channel’s history |
| `/scan-server` | Staff | Scan up to 12 text channels for links |
| `/source-links` | Staff | List recently indexed URLs |
| `/ingest-links` | Staff | Paste a thread’s text (e.g. FMHY) to index URLs |

Re-register slash commands after pulling:

```bash
node discord-bot/scripts/register-commands.mjs
# or guild-specific:
node discord-bot/scripts/register-commands.mjs YOUR_GUILD_ID
```

## Source link intel (FMHY, project-updates, etc.)

**“Add to My Apps” does not let the bot read other servers.** It only lets you use the app in DMs. To index links, use one of these:

### A) Bot is in the server (your server, or any server that invited it)

1. Invite with **Read Message History** (lighter than Administrator):  
   `https://discord.com/api/oauth2/authorize?client_id=1536251834203770941&permissions=68608&scope=bot%20applications.commands`
2. Run `/scan-channel` on `#project-updates` (or `/scan-server` for a broad pass).
3. Run `/source-links` to review.
4. Export for source-hunt / Cursor:

```bash
node discord-bot/scripts/export-discord-links.mjs
```

Output: `scripts/discord-links-export.json`

### B) FMHY / servers that won’t add the bot

1. Discord → **User Settings → Privacy & Safety → Request all of my data**.
2. When the zip arrives, extract it and run:

```bash
node discord-bot/scripts/import-discord-export.mjs "path/to/export" --label fmhy-project-updates
```

3. Or copy a thread and use `/ingest-links` with the pasted text (in any server where the bot is staff).

Apply the DB migration once (Supabase SQL or `supabase db push`):

`supabase/migrations/20260901040000_discord_link_intel.sql`

Deploy the updated edge function:

```bash
supabase functions deploy discord-bot --project-ref khplnaovkxvzhbimuvzn
```

## Hosting

- Interactions / tickets: **Supabase Edge Functions** (`khplnaovkxvzhbimuvzn`)
- Presence + join role: local/VPS process (`set-bot-presence.mjs`)
