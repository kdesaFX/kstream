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
node discord-bot/scripts/set-bot-presence.mjs YOUR_BOT_TOKEN
```

This process must stay online for:
- custom status / “online”
- granting **Member** on `GUILD_MEMBER_ADD`

Optional env: `DISCORD_MEMBER_ROLE_ID`, `DISCORD_GUILD_ID`.

## Finish setup

```bash
node discord-bot/scripts/complete-setup.mjs YOUR_BOT_TOKEN
```

Then in Discord run **`/setup-server`** (Administrator). It creates channels, **Member** + **Updates** roles, and refreshes welcome/support embeds.

Refresh embeds only:

```bash
node discord-bot/scripts/refresh-embeds.mjs YOUR_BOT_TOKEN
```

## Commands

| Command | Who | What |
|---------|-----|------|
| `/ticket [subject]` | Anyone | Opens a private ticket channel |
| `/ticket-close` | Opener or staff | Closes the ticket channel |
| `/update` | Staff/admin | Posts an embed to `#updates` |
| `/setup-server` | Admin | Channels, roles, starter embeds |

## Hosting

- Interactions / tickets: **Supabase Edge Functions** (`khplnaovkxvzhbimuvzn`)
- Presence + join role: local/VPS process (`set-bot-presence.mjs`)
