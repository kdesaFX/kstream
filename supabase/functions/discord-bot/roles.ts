import {
  type Interaction,
  discordJson,
  editOriginal,
  interactionUser,
} from "./discord.ts";
import { saveVaultSetting } from "./config.ts";

export type Env = {
  token: string;
  applicationId: string;
  guildId: string;
  ticketCategoryId?: string;
  closedTicketCategoryId?: string;
  memberRoleId?: string;
  updatesRoleId?: string;
  updatesChannelId?: string;
  welcomeChannelId?: string;
  rulesChannelId?: string;
  supportChannelId?: string;
  staffRoleId?: string;
};

async function ensureNamedRole(
  token: string,
  guildId: string,
  name: string,
  color: number,
  mentionable = false,
): Promise<string> {
  const roles = await discordJson<Array<{ id: string; name: string }>>(
    token,
    `/guilds/${guildId}/roles`,
  );
  const existing = roles.find((r) => r.name === name);
  if (existing) return existing.id;

  const role = await discordJson<{ id: string }>(token, `/guilds/${guildId}/roles`, {
    method: "POST",
    body: JSON.stringify({
      name,
      color,
      hoist: false,
      mentionable,
      permissions: "0",
    }),
  });
  return role.id;
}

export async function ensureMemberRole(token: string, guildId: string): Promise<string> {
  return ensureNamedRole(token, guildId, "Signal", 0x2dd4bf, false);
}

export async function ensureUpdatesRole(token: string, guildId: string): Promise<string> {
  return ensureNamedRole(token, guildId, "Updates", 0x5865f2, true);
}

/** Grant Signal if missing. Silent on failure. */
export async function ensureMemberHasSignal(
  env: Env,
  guildId: string,
  userId: string,
  memberRoles?: string[],
): Promise<void> {
  let roleId = env.memberRoleId;
  if (!roleId) {
    roleId = await ensureMemberRole(env.token, guildId);
    await saveVaultSetting("DISCORD_MEMBER_ROLE_ID", roleId);
    env.memberRoleId = roleId;
  }
  if (memberRoles?.includes(roleId)) return;
  await discordJson(
    env.token,
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    { method: "PUT" },
  ).catch(() => undefined);
}

export async function handleClaimUpdatesRole(
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

  await ensureMemberHasSignal(env, guildId, user.id, interaction.member?.roles);

  let roleId = env.updatesRoleId;
  if (!roleId) {
    roleId = await ensureUpdatesRole(env.token, guildId);
    await saveVaultSetting("DISCORD_UPDATES_ROLE_ID", roleId);
  }

  const hasRole = interaction.member?.roles?.includes(roleId);
  if (hasRole) {
    await discordJson(
      env.token,
      `/guilds/${guildId}/members/${user.id}/roles/${roleId}`,
      { method: "DELETE" },
    );
    await editOriginal(env.token, env.applicationId, interaction.token, {
      content:
        "Update pings off — you won't be mentioned when we post site updates. Tap again anytime to turn them back on.",
    });
    return;
  }

  await discordJson(
    env.token,
    `/guilds/${guildId}/members/${user.id}/roles/${roleId}`,
    { method: "PUT" },
  );

  await editOriginal(env.token, env.applicationId, interaction.token, {
    content:
      "You're set — you'll get pinged for site updates. Tap **Update pings** again to turn them off.",
  });
}

/** Old welcome button — still grants Signal if someone clicks it */
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

  await ensureMemberHasSignal(env, guildId, user.id, interaction.member?.roles);
  await editOriginal(env.token, env.applicationId, interaction.token, {
    content:
      "You're in — **Signal** is the member role. For update notifications, tap **Update pings** on the welcome message.",
  });
}
