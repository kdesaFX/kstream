import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  verifyDiscordRequest,
  type Interaction,
  jsonResponse,
  ephemeral,
} from "./discord.ts";
import { handleCommand, handleComponent } from "./commands.ts";
import { loadEnv } from "./config.ts";

const PUBLIC_KEY =
  Deno.env.get("DISCORD_PUBLIC_KEY") ??
  "cb8edf355b81013b7f84bb228a5df074a5253b2680f42f8ccbbc661b434fc1a5";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify first with known public key so Discord PING stays fast.
  const { valid, body } = await verifyDiscordRequest(req, PUBLIC_KEY);
  if (!valid) {
    return new Response("Invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body) as Interaction;

  if (interaction.type === 1) {
    return jsonResponse({ type: 1 });
  }

  let env;
  try {
    env = await loadEnv();
  } catch (err) {
    return jsonResponse(
      ephemeral(`Bot config error: ${err instanceof Error ? err.message : "error"}`),
    );
  }

  try {
    if (interaction.type === 2) {
      const response = await handleCommand(interaction, env);
      return jsonResponse(response);
    }

    if (interaction.type === 3) {
      const response = await handleComponent(interaction, env);
      return jsonResponse(response);
    }

    return jsonResponse(ephemeral("Unsupported interaction type."));
  } catch (err) {
    console.error(err);
    return jsonResponse(
      ephemeral(`Something went wrong: ${err instanceof Error ? err.message : "error"}`),
    );
  }
});
