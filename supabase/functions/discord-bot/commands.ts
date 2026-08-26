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
  welcomeEmbed,
  rulesEmbed,
  replaceChannelPlaceholders,
} from "./embeds.ts";
import { saveVaultSetting } from "./config.ts";

type Env = {
  token: string;
  applicationId: string;
  guildId: string;
  ticketCategoryId?: string;
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

async function nextTicketName(token: string, guildId: string): Promise<string> {
  const channels = await discordJson<DiscordChannel[]>(
    token,
    `/guilds/${guildId}/channels`,
  );
  const nums = channels
    .map((c) => /^ticket-(\d+)$/.exec(c.name))
    .filter(Boolean)
    .map((m) => parseInt(m![1], 10));
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `ticket-${String(next).padStart(3, "0")}`;
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
      return handleTicket(interaction, env, user);
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

async function handleTicket(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
): Promise<Record<string, unknown>> {
  if (!env.ticketCategoryId) {
    return ephemeral(
      "Tickets are not configured yet. Run `/setup-server` (admin) or set DISCORD_TICKET_CATEGORY_ID.",
    );
  }

  const subject = optionString(interaction, "subject")?.slice(0, 200);
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("discord_tickets")
    .select("channel_id")
    .eq("guild_id", interaction.guild_id!)
    .eq("opener_discord_id", user.id)
    .eq("status", "open")
    .maybeSingle();

  if (existing?.channel_id) {
    return ephemeral(`You already have an open ticket: <#${existing.channel_id}>`);
  }

  const channelName = await nextTicketName(env.token, interaction.guild_id!);
  const channel = await discordJson<DiscordChannel>(
    env.token,
    `/guilds/${interaction.guild_id}/channels`,
    {
      method: "POST",
      body: JSON.stringify({
        name: channelName,
        type: 0,
        parent_id: env.ticketCategoryId,
        topic: `Ticket for ${user.username}${subject ? ` — ${subject}` : ""}`,
        permission_overwrites: [
          {
            id: interaction.guild_id,
            type: 0,
            deny: "1024",
          },
          {
            id: user.id,
            type: 1,
            allow: "3072",
          },
          ...(env.staffRoleId
            ? [{
              id: env.staffRoleId,
              type: 0,
              allow: "3072",
            }]
            : []),
        ],
      }),
    },
  );

  await supabase.from("discord_tickets").insert({
    guild_id: interaction.guild_id,
    channel_id: channel.id,
    opener_discord_id: user.id,
    subject: subject ?? null,
    status: "open",
  });

  const embed = ticketOpenEmbed(subject ?? "", `<@${user.id}>`);
  await discordJson(env.token, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: `<@${user.id}>`,
      embeds: [embed],
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

  return ephemeral(`Ticket created: <#${channel.id}>`);
}

async function handleTicketClose(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
): Promise<Record<string, unknown>> {
  const channelId = interaction.channel_id;
  if (!channelId) return ephemeral("Run this inside a ticket channel.");

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

  await supabase
    .from("discord_tickets")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", ticket.id);

  await discordJson(env.token, `/channels/${channelId}`, {
    method: "DELETE",
  }).catch(() => undefined);

  return ephemeral("Ticket closed.");
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
      "Updates channel not configured. Run `/setup-server` or set DISCORD_UPDATES_CHANNEL_ID.",
    );
  }

  const title = optionString(interaction, "title");
  const description = optionString(interaction, "description");
  const type = (optionString(interaction, "type") ?? "small") as "small" | "big";

  if (!title || !description) {
    return ephemeral("Title and description are required.");
  }

  const displayName = user.global_name ?? user.username;
  const embed = updateEmbed(title, description, type, displayName);

  await discordJson(env.token, `/channels/${env.updatesChannelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [embed] }),
  });

  return ephemeral(`Update posted to <#${env.updatesChannelId}>. (No ping — tell me if you want one later.)`);
}

async function handleSetupServer(
  interaction: Interaction,
  env: Env,
  user: { id: string; username: string },
): Promise<Record<string, unknown>> {
  if (!hasAdmin(interaction)) {
    return ephemeral("You need Administrator to run server setup.");
  }

  const guildId = interaction.guild_id!;
  const deferred = { type: 5, data: { flags: 64 } };

  queueMicrotask(async () => {
    try {
      const created = await runServerSetup(env.token, guildId, env.applicationId);

      await saveVaultSetting("DISCORD_GUILD_ID", guildId);
      await saveVaultSetting("DISCORD_RULES_CHANNEL_ID", created.rulesId);
      await saveVaultSetting("DISCORD_WELCOME_CHANNEL_ID", created.welcomeId);
      await saveVaultSetting("DISCORD_UPDATES_CHANNEL_ID", created.updatesId);
      await saveVaultSetting("DISCORD_SUPPORT_CHANNEL_ID", created.supportId);
      await saveVaultSetting("DISCORD_TICKET_CATEGORY_ID", created.ticketCategoryId);

      await editOriginal(env.token, env.applicationId, interaction.token, {
        content: [
          "Server setup complete. Channel IDs saved to Supabase Vault.",
          "",
          `#rules <#${created.rulesId}>`,
          `#welcome <#${created.welcomeId}>`,
          `#updates <#${created.updatesId}>`,
          `#support <#${created.supportId}>`,
          `Tickets category: \`${created.ticketCategoryId}\``,
        ].join("\n"),
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

export async function runServerSetup(
  token: string,
  guildId: string,
  _applicationId: string,
) {
  const existing = await discordJson<DiscordChannel[]>(
    token,
    `/guilds/${guildId}/channels`,
  );

  const findByName = (name: string) =>
    existing.find((c) => c.name === name)?.id;

  let rulesId = findByName("rules");
  let welcomeId = findByName("welcome");
  let updatesId = findByName("updates");
  let supportId = findByName("support");
  let ticketCategoryId = existing.find((c) => c.name === "Support Tickets" && c.type === 4)?.id;

  if (!rulesId) {
    const ch = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "rules", type: 0, topic: "Server rules" }),
    });
    rulesId = ch.id;
    await discordJson(token, `/channels/${rulesId}/messages`, {
      method: "POST",
      body: JSON.stringify({ embeds: [rulesEmbed()] }),
    });
  }

  if (!welcomeId) {
    const ch = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "welcome", type: 0, topic: "Welcome" }),
    });
    welcomeId = ch.id;
  }

  if (!updatesId) {
    const ch = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: "updates",
        type: 0,
        topic: "kdesa.stream site updates",
      }),
    });
    updatesId = ch.id;
  }

  if (!supportId) {
    const ch = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: "support",
        type: 0,
        topic: "Open a ticket with /ticket",
      }),
    });
    supportId = ch.id;
    await discordJson(token, `/channels/${supportId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        embeds: [{
          title: "Need help?",
          description: "Use `/ticket` anywhere in the server to open a private support channel.",
          color: 0x5865f2,
        }],
      }),
    });
  }

  if (!ticketCategoryId) {
    const cat = await discordJson<DiscordChannel>(token, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name: "Support Tickets", type: 4 }),
    });
    ticketCategoryId = cat.id;
  }

  const welcome = replaceChannelPlaceholders(welcomeEmbed(), {
    rules: rulesId,
    support: supportId,
    updates: updatesId,
  });
  await discordJson(token, `/channels/${welcomeId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [welcome] }),
  });

  return {
    rulesId: rulesId!,
    welcomeId: welcomeId!,
    updatesId: updatesId!,
    supportId: supportId!,
    ticketCategoryId: ticketCategoryId!,
  };
}

export async function handleComponent(
  interaction: Interaction,
  env: Env,
): Promise<Record<string, unknown>> {
  if (interaction.data?.custom_id !== "ticket_close") {
    return ephemeral("Unknown action.");
  }

  const user = interactionUser(interaction);
  if (!user || !interaction.channel_id) {
    return ephemeral("Could not resolve user.");
  }

  const fakeCommand: Interaction = {
    ...interaction,
    data: { name: "ticket-close" },
  };
  return handleTicketClose(fakeCommand, env, user);
}
