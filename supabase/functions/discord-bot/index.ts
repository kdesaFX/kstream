import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  verifyDiscordRequest,
  type Interaction,
  jsonResponse,
  ephemeral,
  followUp,
} from "./discord.ts";
import {
  handleCommand,
  handleComponent,
  handleTicketButton,
  handleClaimMemberRole,
  handleClaimUpdatesRole,
} from "./commands.ts";
import { loadEnv } from "./config.ts";

const PUBLIC_KEY =
  Deno.env.get("DISCORD_PUBLIC_KEY") ??
  "cb8edf355b81013b7f84bb228a5df074a5253b2680f42f8ccbbc661b434fc1a5";

const DEFER_IDS = new Set([
  "ticket_open_support",
  "ticket_open_report",
  "claim_member_role",
  "claim_updates_role",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { valid, body } = await verifyDiscordRequest(req, PUBLIC_KEY);
  if (!valid) {
    return new Response("Invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body) as Interaction;

  if (interaction.type === 1) {
    return jsonResponse({ type: 1 });
  }

  // ACK buttons in <1s so Discord never times out.
  const customId = interaction.data?.custom_id;
  if (interaction.type === 3 && customId && DEFER_IDS.has(customId)) {
    queueMicrotask(async () => {
      try {
        const env = await loadEnv();
        if (customId === "claim_updates_role") {
          await handleClaimUpdatesRole(interaction, env);
        } else if (customId === "claim_member_role") {
          await handleClaimMemberRole(interaction, env);
        } else {
          await handleTicketButton(interaction, env, customId);
        }
      } catch (err) {
        console.error(err);
        try {
          const env = await loadEnv();
          await followUp(env.token, env.applicationId, interaction.token, {
            content: `Failed: ${err instanceof Error ? err.message : String(err)}`,
            flags: 64,
          });
        } catch {
          /* ignore */
        }
      }
    });
    return jsonResponse({ type: 5, data: { flags: 64 } });
  }

  try {
    const env = await loadEnv();

    if (interaction.type === 2) {
      return jsonResponse(await handleCommand(interaction, env));
    }

    if (interaction.type === 3) {
      return jsonResponse(await handleComponent(interaction, env));
    }

    return jsonResponse(ephemeral("Unsupported interaction type."));
  } catch (err) {
    console.error(err);
    return jsonResponse(
      ephemeral(`Something went wrong: ${err instanceof Error ? err.message : "error"}`),
    );
  }
});
