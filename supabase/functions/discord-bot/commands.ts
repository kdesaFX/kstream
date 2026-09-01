import {
  type Interaction,
  followUp,
  interactionUser,
  ephemeral,
} from "./discord.ts";
import {
  type Env,
  handleClaimMemberRole,
  handleClaimUpdatesRole,
} from "./roles.ts";
import {
  handleTicketButton,
  handleTicketClose,
  openReportTicket,
  openSupportTicket,
} from "./tickets.ts";
import { handleSetupServer, handleUpdate } from "./setup.ts";
import {
  handleIngestLinks,
  handleSourceLinks,
  isDeferredSourceIntelCommand,
  runSourceIntelDeferred,
} from "./sourceIntel.ts";

export { handleClaimMemberRole, handleClaimUpdatesRole, handleTicketButton };

export async function handleCommand(
  interaction: Interaction,
  env: Env,
): Promise<Record<string, unknown>> {
  const name = interaction.data?.name;
  const user = interactionUser(interaction);
  if (!user || !interaction.guild_id) {
    return ephemeral("This command only works in a server.");
  }

  switch (name) {
    case "ticket":
      return openSupportTicket(interaction, env, user);
    case "ticket-close":
      return handleTicketClose(interaction, env, user);
    case "update":
      return handleUpdate(interaction, env, user);
    case "setup-server":
      return handleSetupServer(interaction, env, user);
    case "source-links":
      return handleSourceLinks(interaction, env);
    case "ingest-links":
      return handleIngestLinks(interaction, env);
    default:
      return ephemeral("Unknown command.");
  }
}

export async function handleComponent(
  interaction: Interaction,
  env: Env,
): Promise<Record<string, unknown>> {
  const customId = interaction.data?.custom_id;
  const user = interactionUser(interaction);
  if (!user) return ephemeral("Could not resolve user.");

  if (customId === "ticket_close") {
    return handleTicketClose(interaction, env, user);
  }

  if (customId === "ticket_open_support") {
    return openSupportTicket(interaction, env, user);
  }

  if (customId === "ticket_open_report") {
    return openReportTicket(interaction, env, user);
  }

  if (customId === "claim_updates_role" || customId === "claim_member_role") {
    const work = (async () => {
      try {
        if (customId === "claim_updates_role") {
          await handleClaimUpdatesRole(interaction, env);
        } else {
          await handleClaimMemberRole(interaction, env);
        }
      } catch (err) {
        await followUp(env.token, env.applicationId, interaction.token, {
          content: `Failed: ${err instanceof Error ? err.message : String(err)}`,
          flags: 64,
        }).catch(() => undefined);
      }
    })();
    try {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(work);
    } catch {
      /* ignore */
    }
    return { type: 5, data: { flags: 64 } };
  }

  return ephemeral("Unknown action.");
}
