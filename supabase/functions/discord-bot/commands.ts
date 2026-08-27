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
import {
  updateEmbed,
  ticketOpenEmbed,
  welcomeEmbeds,
  welcomeComponents,
  infoEmbeds,
  supportPanelEmbeds,
  supportPanelComponents,
} from "./embeds.ts";
import { saveVaultSetting } from "./config.ts";

function deferredEphemeral() {
  return { type: 5, data: { flags: 64 } };
}

type Env = {
  token: string;
  applicationId: string;
  guildId: string;
  ticketCategoryId?: string;
  closedTicketCategoryId?: string;
  memberRoleId?: string;
  updatesChannelId?: string;
  welcomeChannelId?: string;
  rulesChannelId?: string;
  supportChannelId?: string;
  staffRoleId?: string;
};

type DiscordChannel = { id: string; name: string; type: number };

function optionString(
  interaction: Interaction,
  name: string,
): string | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  return typeof opt?.value === "string" ? opt.value : undefined;
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
      return startTicketDeferred(interaction, env, user, "support");
    case "ticket-close":
      return handleTicketClose(interaction, env, user);
    case "update":
      return handleUpdate(interaction, env, user);
    case "setup-server":
      return handleSetupServer(interaction, env, user);
    default:
      return ephemeral("Unknown command.");
  }
}

function startTicketDeferred(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
  kind: "support" | "report",
  subjectOverride?: string,
): Record<string, unknown> {
  queueMicrotask(async () => {
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
  });
  return deferredEphemeral();
}

async function createTicket(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
  kind: "support" | "report" = "support",
  subjectOverride?: string,
): Promise<{ data: { content: string } }> {
  if (!env.ticketCategoryId) {
    return ephemeral(
      "Tickets are not configured yet. Run `/setup-server` (admin).",
    ) as { data: { content: string } };
  }

  const subject =
    (subjectOverride ?? optionString(interaction, "subject"))?.slice(0, 200) ??
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

async function handleTicket(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
  kind: "support" | "report" = "support",
  subjectOverride?: string,
): Promise<Record<string, unknown>> {
  return startTicketDeferred(interaction, env, user, kind, subjectOverride);
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
        // @everyone — cannot see closed tickets
        { id: guildId, type: 0, deny: "1024" },
        ...(staffRoleId
          ? [{ id: staffRoleId, type: 0, allow: "1024" }]
          : []),
      ],
    }),
  });
  return cat.id;
}

async function handleTicketClose(
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

  // ACK fast — archive happens after.
  queueMicrotask(async () => {
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
          // Lock: nobody (@everyone) can view; opener loses access; staff keeps view if set
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
                allow: "117760", // view + send + read history
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
  });

  return { type: 5, data: { flags: 64 } };
}

async function handleUpdate(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string; global_name?: string },
): Promise<Record<string, unknown>> {
  if (!isStaff(interaction, env)) {
    return ephemeral("Only staff can post updates.");
  }

  if (!env.updatesChannelId) {
    return ephemeral(
      "Updates channel not configured. Run `/setup-server`.",
    );
  }

  const title = optionString(interaction, "title");
  const description = optionString(interaction, "description");
  const type = (optionString(interaction, "type") ?? "small") as "small" | "big";

  if (!title || !description) {
    return ephemeral("Title and description are required.");
  }

  const displayName = user.global_name ?? user.username;
  await discordJson(env.token, `/channels/${env.updatesChannelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: [updateEmbed(title, description, type, displayName)],
    }),
  });

  return ephemeral(
    `Update posted to <#${env.updatesChannelId}>. (No ping — tell me when you want one.)`,
  );
}

async function handleSetupServer(
  interaction: Interaction,
  env: Env,
  _user: { id: string; username: string },
): Promise<Record<string, unknown>> {
  if (!hasAdmin(interaction)) {
    return ephemeral("You need Administrator to run server setup.");
  }

  const guildId = interaction.guild_id!;
  const deferred = { type: 5, data: { flags: 64 } };

  queueMicrotask(async () => {
    try {
      const created = await runServerSetup(env.token, guildId);

      await saveVaultSetting("DISCORD_GUILD_ID", guildId);
      await saveVaultSetting("DISCORD_WELCOME_CHANNEL_ID", created.welcomeId);
      await saveVaultSetting("DISCORD_UPDATES_CHANNEL_ID", created.updatesId);
      await saveVaultSetting("DISCORD_SUPPORT_CHANNEL_ID", created.supportId);
      await saveVaultSetting("DISCORD_TICKET_CATEGORY_ID", created.ticketCategoryId);
      await saveVaultSetting(
        "DISCORD_CLOSED_TICKET_CATEGORY_ID",
        created.closedTicketCategoryId,
      );
      if (created.memberRoleId) {
        await saveVaultSetting("DISCORD_MEMBER_ROLE_ID", created.memberRoleId);
      }

      await editOriginal(env.token, env.applicationId, interaction.token, {
        content: [
          "Server setup / embed refresh complete.",
          "",
          `#welcome <#${created.welcomeId}>`,
          `#updates <#${created.updatesId}>`,
          `#support <#${created.supportId}>`,
          `Open tickets: \`${created.ticketCategoryId}\``,
          `Closed tickets: \`${created.closedTicketCategoryId}\``,
          created.memberRoleId
            ? `Member role (Signal): \`${created.memberRoleId}\``
            : "",
        ].filter(Boolean).join("\n"),
      });
    } catch (err) {
      await followUp(env.token, env.applicationId, interaction.token, {
        content: `Setup failed: ${err instanceof Error ? err.message : String(err)}`,
        flags: 64,
      });
    }
  });

  return deferred;
}

async function ensureChannel(
  token: string,
  guildId: string,
  existing: DiscordChannel[],
  name: string,
  topic: string,
): Promise<string> {
  const found = existing.find((c) => c.name === name || c.name.endsWith(name));
  if (found) {
    // Rename to emoji style if still plain
    if (found.name === name.replace(/^[^a-z0-9-]+/i, "") || found.name === name) {
      // keep as-is if already good
    }
    return found.id;
  }
  const ch = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name, type: 0, topic }),
  });
  return ch.id;
}

async function ensureMemberRole(token: string, guildId: string): Promise<string> {
  const roles = await discordJson<Array<{ id: string; name: string }>>(
    token,
    `/guilds/${guildId}/roles`,
  );
  const existing = roles.find((r) => r.name === "Signal");
  if (existing) return existing.id;

  const role = await discordJson<{ id: string }>(token, `/guilds/${guildId}/roles`, {
    method: "POST",
    body: JSON.stringify({
      name: "Signal",
      color: 0x2dd4bf,
      hoist: false,
      mentionable: false,
      permissions: "0",
    }),
  });
  return role.id;
}

export async function runServerSetup(token: string, guildId: string) {
  const existing = await discordJson<DiscordChannel[]>(
    token,
    `/guilds/${guildId}/channels`,
  );

  const find = (...names: string[]) =>
    existing.find((c) => names.includes(c.name))?.id;

  let welcomeId = find("welcome", "👋・welcome", "👋-welcome");
  let updatesId = find("updates", "📢・updates", "📢-updates");
  let supportId = find("support", "🛠️・support", "🛠️-support");
  let ticketCategoryId = existing.find(
    (c) => (c.name === "Support Tickets" || c.name === "tickets") && c.type === 4,
  )?.id;
  let closedTicketCategoryId = existing.find(
    (c) =>
      c.type === 4 &&
      (c.name === "Closed Tickets" || c.name === "closed-tickets" ||
        c.name === "Closed tickets"),
  )?.id;

  if (!welcomeId) {
    welcomeId = await ensureChannel(token, guildId, existing, "👋・welcome", "Welcome");
  } else {
    await discordJson(token, `/channels/${welcomeId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "👋・welcome" }),
    }).catch(() => undefined);
  }

  if (!updatesId) {
    updatesId = await ensureChannel(
      token,
      guildId,
      existing,
      "📢・updates",
      "kdesa.stream site updates",
    );
  } else {
    await discordJson(token, `/channels/${updatesId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "📢・updates" }),
    }).catch(() => undefined);
  }

  if (!supportId) {
    supportId = await ensureChannel(
      token,
      guildId,
      existing,
      "🛠️・support",
      "Open a ticket with the buttons below",
    );
  } else {
    await discordJson(token, `/channels/${supportId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "🛠️・support" }),
    }).catch(() => undefined);
  }

  if (!ticketCategoryId) {
    const cat = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "Support Tickets", type: 4 }),
    });
    ticketCategoryId = cat.id;
  }

  if (!closedTicketCategoryId) {
    closedTicketCategoryId = await ensureClosedTicketCategory(token, guildId);
  } else {
    await discordJson(token, `/channels/${closedTicketCategoryId}`, {
      method: "PATCH",
      body: JSON.stringify({
        permission_overwrites: [
          { id: guildId, type: 0, deny: "1024" },
        ],
      }),
    }).catch(() => undefined);
  }

  const memberRoleId = await ensureMemberRole(token, guildId);

  const ids = {
    welcome: welcomeId!,
    updates: updatesId!,
    support: supportId!,
  };

  await purgeBotMessages(token, welcomeId!);
  await discordJson(token, `/channels/${welcomeId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: [...welcomeEmbeds(ids), ...infoEmbeds(ids)],
      components: welcomeComponents(),
    }),
  });

  await purgeBotMessages(token, supportId!);
  await discordJson(token, `/channels/${supportId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      embeds: supportPanelEmbeds(ids),
      components: supportPanelComponents(),
    }),
  });

  return {
    welcomeId: welcomeId!,
    updatesId: updatesId!,
    supportId: supportId!,
    ticketCategoryId: ticketCategoryId!,
    closedTicketCategoryId: closedTicketCategoryId!,
    memberRoleId,
  };
}

async function purgeBotMessages(token: string, channelId: string) {
  const me = await discordJson<{ id: string }>(token, "/users/@me");
  const messages = await discordJson<Array<{ id: string; author: { id: string } }>>(
    token,
    `/channels/${channelId}/messages?limit=50`,
  );
  for (const msg of messages) {
    if (msg.author.id !== me.id) continue;
    await discordJson(token, `/channels/${channelId}/messages/${msg.id}`, {
      method: "DELETE",
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 350));
  }
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

export async function handleClaimMemberRole(
  interaction: Interaction,
  env: Env,
): Promise<void> {
  const user = interactionUser(interaction);
  const guildId = interaction.guild_id;
  if (!user || !guildId) {
    await editOriginal(env.token, env.applicationId, interaction.token, {
      content: "Could not resolve user.",
    });
    return;
  }

  let roleId = env.memberRoleId;
  if (!roleId) {
    roleId = await ensureMemberRole(env.token, guildId);
    await saveVaultSetting("DISCORD_MEMBER_ROLE_ID", roleId);
  }

  const member = interaction.member;
  if (member?.roles?.includes(roleId)) {
    await editOriginal(env.token, env.applicationId, interaction.token, {
    content: "You're tuned in — **Signal** is your member role on this server.",
  });
  return;
  }

  await discordJson(
    env.token,
    `/guilds/${guildId}/members/${user.id}/roles/${roleId}`,
    { method: "PUT" },
  );

  await editOriginal(env.token, env.applicationId, interaction.token, {
    content: "You're in — **Signal** is the member role for kdesa.stream.",
  });
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
    return startTicketDeferred(interaction, env, user, "support", "General Support");
  }

  if (customId === "ticket_open_report") {
    return startTicketDeferred(interaction, env, user, "report", "Report");
  }

  if (customId === "claim_member_role") {
    queueMicrotask(async () => {
      try {
        await handleClaimMemberRole(interaction, env);
      } catch (err) {
        await followUp(env.token, env.applicationId, interaction.token, {
          content: `Failed: ${err instanceof Error ? err.message : String(err)}`,
          flags: 64,
        }).catch(() => undefined);
      }
    });
    return { type: 5, data: { flags: 64 } };
  }

  return ephemeral("Unknown action.");
}
