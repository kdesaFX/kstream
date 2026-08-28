import {
  type Interaction,
  discordJson,
  followUp,
  editOriginal,
  hasAdmin,
  ephemeral,
} from "./discord.ts";
import {
  updateEmbed,
  welcomeEmbeds,
  welcomeComponents,
  infoEmbeds,
  supportPanelEmbeds,
  supportPanelComponents,
} from "./embeds.ts";
import { saveVaultSetting } from "./config.ts";
import {
  type Env,
  ensureMemberRole,
  ensureUpdatesRole,
} from "./roles.ts";

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

async function ensureChannel(
  token: string,
  guildId: string,
  existing: DiscordChannel[],
  name: string,
  topic: string,
): Promise<string> {
  const found = existing.find((c) => c.name === name || c.name.endsWith(name));
  if (found) return found.id;
  const ch = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name, type: 0, topic }),
  });
  return ch.id;
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
  const updatesRoleId = await ensureUpdatesRole(token, guildId);

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
    updatesRoleId,
  };
}

export async function handleUpdate(
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

export async function handleSetupServer(
  interaction: Interaction,
  env: Env,
  _user: { id: string; username: string },
): Promise<Record<string, unknown>> {
  if (!hasAdmin(interaction)) {
    return ephemeral("You need Administrator to run server setup.");
  }

  const guildId = interaction.guild_id!;
  const deferred = { type: 5, data: { flags: 64 } };

  const work = (async () => {
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
      if (created.updatesRoleId) {
        await saveVaultSetting("DISCORD_UPDATES_ROLE_ID", created.updatesRoleId);
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
            ? `Member role (Signal, on join): \`${created.memberRoleId}\``
            : "",
          created.updatesRoleId
            ? `Updates ping role: \`${created.updatesRoleId}\``
            : "",
          "",
          "Set Signal as a Default Role: Server Settings → Onboarding → Default Roles.",
        ].filter(Boolean).join("\n"),
      });
    } catch (err) {
      await followUp(env.token, env.applicationId, interaction.token, {
        content: `Setup failed: ${err instanceof Error ? err.message : String(err)}`,
        flags: 64,
      });
    }
  })();
  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  } catch {
    /* ignore */
  }

  return deferred;
}
