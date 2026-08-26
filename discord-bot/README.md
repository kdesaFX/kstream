# kdesa.stream Discord support bot

Supabase Edge Function + slash commands for tickets, update embeds, and one-shot server setup.

## Add the bot (admin)

Open this link, pick your server, authorize:

**https://discord.com/api/oauth2/authorize?client_id=1536251834203770941&permissions=8&scope=bot%20applications.commands**

(`Administrator` so it can create channels/categories during setup. You can lower permissions later.)

## Security

Your **bot token** and **client secret** were visible in chat/screenshots. After setup:

1. [Developer Portal](https://discord.com/developers/applications/1536251834203770941) → **Bot** → **Reset Token**
2. **OAuth2** → **Reset Secret**
3. Put the new values in Supabase secrets only — never commit them.

## Supabase config (Vault)

Project: `khplnaovkxvzhbimuvzn`

Secrets live in **Supabase Vault** (not git). The edge function reads them via `discord_bot_setting` RPC.

Required vault secret names:

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

Update a secret in SQL editor:

```sql
select public.discord_bot_upsert_setting('DISCORD_BOT_TOKEN', 'your_new_token');
```

## Discord Developer Portal

**General Information → Interactions Endpoint URL:**

```
https://khplnaovkxvzhbimuvzn.supabase.co/functions/v1/discord-bot
```

Save — Discord will send a PING to verify the endpoint.

## Finish setup (one command)

After adding the bot to your server, run:

```bash
node discord-bot/scripts/complete-setup.mjs YOUR_BOT_TOKEN
```

This sets the interactions endpoint, registers slash commands, creates channels, and saves IDs to Vault.

If the token from the screenshot no longer works (401), reset it in the Developer Portal → Bot → Reset Token, then:

```sql
select public.discord_bot_upsert_setting('DISCORD_BOT_TOKEN', 'new_token_here');
```

Then re-run `complete-setup.mjs`.

## After the bot is in your server

1. Register slash commands (replace `YOUR_GUILD_ID`):

```bash
DISCORD_BOT_TOKEN=your_token node discord-bot/scripts/register-commands.mjs YOUR_GUILD_ID
```

2. In Discord, run **`/setup-server`** (needs Administrator). It creates:
   - `#rules` — rules embed
   - `#welcome` — welcome embed
   - `#updates` — where `/update` posts
   - `#support` — ticket instructions
   - **Support Tickets** category — private ticket channels

3. Copy the channel IDs from the command reply into Supabase secrets.

## Commands

| Command | Who | What |
|---------|-----|------|
| `/ticket [subject]` | Anyone | Opens a private ticket channel |
| `/ticket-close` | Opener or staff | Closes and deletes the ticket channel |
| `/update` | Staff/admin | Posts an embed to `#updates` (no @everyone — you say when to ping) |
| `/setup-server` | Admin | Creates channels + starter embeds |

## Deploy function

From repo (or use Supabase dashboard):

```bash
supabase functions deploy discord-bot --project-ref khplnaovkxvzhbimuvzn --no-verify-jwt
```

JWT verification is off because Discord authenticates via Ed25519 signature on each request.
