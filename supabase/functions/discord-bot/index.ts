import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  verifyDiscordRequest,
  type Interaction,
  jsonResponse,
  ephemeral,
} from "./discord.ts";
import { handleCommand, handleComponent } from "./commands.ts";
import { loadEnv } from "./config.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let env;
  try {
    env = await loadEnv();
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }

  const { valid, body } = await verifyDiscordRequest(req, env.publicKey);
  if (!valid) {
    return new Response("Invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body) as Interaction;

  if (interaction.type === 1) {
    return jsonResponse({ type: 1 });
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
