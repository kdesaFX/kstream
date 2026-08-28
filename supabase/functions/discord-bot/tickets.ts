import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  type Interaction,
  discordJson,
  followUp,
  editOriginal,
  interactionUser,
  hasAdmin,
  ephemeral,
} from "./discord.ts";
import { ticketOpenEmbed } from "./embeds.ts";
import { saveVaultSetting } from "./config.ts";
import { type Env, ensureMemberHasSignal } from "./roles.ts";

type DiscordChannel = { id: string; name: string; type: number };

function deferredEphemeral() {
  return { type: 5, data: { flags: 64 } };
}

function isStaff(interaction: Interaction, env: Env): boolean {
  if (hasAdmin(interaction)) return true;
  if (!env.staffRoleId) return hasAdmin(interaction);
  return interaction.member?.roles.includes(env.staffRoleId) ?? false;
}

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function nextTicketName(
  token: string,
  guildId: string,
  prefix = "ticket",
): Promise<string> {
  const channels = await discordJson<DiscordChannel[]>(
    token,
    `/guilds/${guildId}/channels`,
  );
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const nums = channels
    .map((c) => re.exec(c.name))
    .filter(Boolean)
    .map((m) => parseInt(m![1], 10));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

async function createTicket(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
  kind: "support" | "report" = "support",
  subjectOverride?: string,
): Promise<{ data: { content: string } }> {
  if (interaction.guild_id) {
    await ensureMemberHasSignal(
      env,
      interaction.guild_id,
      user.id,
      interaction.member?.roles,
    );
  }

  if (!env.ticketCategoryId) {
    return ephemeral(
      "Tickets are not configured yet. Run `/setup-server` (admin).",
    ) as { data: { content: string } };
  }

  const subject =
    subjectOverride?.slice(0, 200) ??
    (kind === "report" ? "Report" : "Support");
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("discord_tickets")
    .select("channel_id")
    .eq("guild_id", interaction.guild_id!)
    .eq("opener_discord_id", user.id)
    .eq("status", "open")
    .maybeSingle();

  if (existing?.channel_id) {
    return ephemeral(`You already have an open ticket: <#${existing.channel_id}>`) as {
      data: { content: string };
    };
  }

  const prefix = kind === "report" ? "report" : "ticket";
  const channelName = await nextTicketName(env.token, interaction.guild_id!, prefix);
  const channel = await discordJson<DiscordChannel>(
    env.token,
    `/guilds/${interaction.guild_id}/channels`,
    {
      method: "POST",
      body: JSON.stringify({
        name: channelName,
        type: 0,
        parent_id: env.ticketCategoryId,
        topic: `${kind} for ${user.username} — ${subject}`,
        permission_overwrites: [
          { id: interaction.guild_id, type: 0, deny: "1024" },
          { id: user.id, type: 1, allow: "3072" },
          ...(env.staffRoleId
            ? [{ id: env.staffRoleId, type: 0, allow: "3072" }]
            : []),
        ],
      }),
    },
  );

  await supabase.from("discord_tickets").insert({
    guild_id: interaction.guild_id,
    channel_id: channel.id,
    opener_discord_id: user.id,
    subject,
    status: "open",
  });

  await discordJson(env.token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: `<@${user.id}>`,
      embeds: [ticketOpenEmbed(subject, `<@${user.id}>`, kind)],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 4,
          label: "Close ticket",
          custom_id: "ticket_close",
        }],
      }],
    }),
  });

  return ephemeral(`Ticket created: <#${channel.id}>`) as { data: { content: string } };
}

function startTicketDeferred(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
  kind: "support" | "report",
  subjectOverride?: string,
): Record<string, unknown> {
  const work = (async () => {
    try {
      const result = await createTicket(interaction, env, user, kind, subjectOverride);
      const content =
        typeof result.data === "object" && result.data && "content" in result.data
          ? String((result.data as { content: string }).content)
          : "Done.";
      await editOriginal(env.token, env.applicationId, interaction.token, {
        content,
      });
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
  return deferredEphemeral();
}

async function ensureClosedTicketCategory(
  token: string,
  guildId: string,
  staffRoleId?: string,
): Promise<string> {
  const existing = await discordJson<DiscordChannel[]>(
    token,
    `/guilds/${guildId}/channels`,
  );
  const found = existing.find(
    (c) =>
      c.type === 4 &&
      (c.name === "Closed Tickets" || c.name === "closed-tickets" ||
        c.name === "Closed tickets"),
  );
  if (found) return found.id;

  const cat = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: "Closed Tickets",
      type: 4,
      permission_overwrites: [
        { id: guildId, type: 0, deny: "1024" },
        ...(staffRoleId
          ? [{ id: staffRoleId, type: 0, allow: "1024" }]
          : []),
      ],
    }),
  });
  return cat.id;
}

export async function handleTicketClose(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
): Promise<Record<string, unknown>> {
  const channelId = interaction.channel_id;
  if (!channelId) return ephemeral("Run this inside a ticket channel.");

  const guildId = interaction.guild_id;
  if (!guildId) return ephemeral("Missing guild.");

  const supabase = supabaseAdmin();
  const { data: ticket } = await supabase
    .from("discord_tickets")
    .select("*")
    .eq("channel_id", channelId)
    .eq("status", "open")
    .maybeSingle();

  if (!ticket) {
    return ephemeral("This is not an open ticket channel.");
  }

  const canClose = ticket.opener_discord_id === user.id || isStaff(interaction, env);
  if (!canClose) {
    return ephemeral("Only the ticket opener or staff can close this.");
  }

  const work = (async () => {
    try {
      let closedCategoryId = env.closedTicketCategoryId;
      if (!closedCategoryId) {
        closedCategoryId = await ensureClosedTicketCategory(
          env.token,
          guildId,
          env.staffRoleId,
        );
        await saveVaultSetting("DISCORD_CLOSED_TICKET_CATEGORY_ID", closedCategoryId);
      }

      const channel = await discordJson<{ name: string }>(
        env.token,
        `/channels/${channelId}`,
      );
      const closedName = channel.name.startsWith("closed-")
        ? channel.name
        : `closed-${channel.name}`.slice(0, 100);

      await discordJson(env.token, `/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: closedName,
          parent_id: closedCategoryId,
          permission_overwrites: [
            { id: guildId, type: 0, deny: "1024" },
            {
              id: ticket.opener_discord_id,
              type: 1,
              deny: "1024",
            },
            ...(env.staffRoleId
              ? [{
                id: env.staffRoleId,
                type: 0,
                allow: "117760",
              }]
              : []),
          ],
        }),
      });

      await discordJson(env.token, `/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          embeds: [{
            title: "Ticket closed",
            description: `Closed by <@${user.id}>. Moved to **Closed Tickets** (hidden from members).`,
            color: 0x111214,
          }],
          components: [],
        }),
      }).catch(() => undefined);

      await supabase
        .from("discord_tickets")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", ticket.id);

      await editOriginal(env.token, env.applicationId, interaction.token, {
        content: "Ticket closed and archived to **Closed Tickets**.",
      }).catch(async () => {
        await followUp(env.token, env.applicationId, interaction.token, {
          content: "Ticket closed and archived to **Closed Tickets**.",
          flags: 64,
        }).catch(() => undefined);
      });
    } catch (err) {
      await followUp(env.token, env.applicationId, interaction.token, {
        content: `Close failed: ${err instanceof Error ? err.message : String(err)}`,
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

export async function handleTicketButton(
  interaction: Interaction,
  env: Env,
  customId: string,
): Promise<void> {
  const user = interactionUser(interaction);
  if (!user) {
    await editOriginal(env.token, env.applicationId, interaction.token, {
      content: "Could not resolve user.",
    });
    return;
  }

  const kind = customId === "ticket_open_report" ? "report" : "support";
  const subject = kind === "report" ? "Report" : "General Support";
  const result = await createTicket(interaction, env, user, kind, subject);
  const content =
    typeof result.data === "object" && result.data && "content" in result.data
      ? String((result.data as { content: string }).content)
      : "Done.";
  await editOriginal(env.token, env.applicationId, interaction.token, { content });
}

export function openSupportTicket(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
) {
  return startTicketDeferred(interaction, env, user, "support", "General Support");
}

export function openReportTicket(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
) {
  return startTicketDeferred(interaction, env, user, "report", "Report");
}
