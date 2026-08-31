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

const MEMBER_ROLE_NAME = "Member";
const LEGACY_MEMBER_ROLE_NAME = "Signal";
/** Teal accent — display-only; permissions stay empty (safe). */
const MEMBER_ROLE_COLOR = 0x2dd4bf;

type GuildRole = { id: string; name: string; permissions?: string };

async function listRoles(
  token: string,
  guildId: string,
): Promise<GuildRole[]> {
  return discordJson<GuildRole[]>(token, `/guilds/${guildId}/roles`);
}

async function ensureNamedRole(
  token: string,
  guildId: string,
  name: string,
  color: number,
  mentionable = false,
): Promise<string> {
  const roles = await listRoles(token, guildId);
  const existing = roles.find((r) => r.name === name);
  if (existing) return existing.id;

  const role = await discordJson<{ id: string }>(token, `/guilds/${guildId}/roles`, {
    method: "POST",
    body: JSON.stringify({
      name,
      color,
      hoist: false,
      mentionable,
      // No elevated permissions — label/access role only.
      permissions: "0",
    }),
  });
  return role.id;
}

/**
 * Ensure the Member role exists (permissions: none).
 * Renames legacy "Signal" → "Member" when found.
 */
export async function ensureMemberRole(
  token: string,
  guildId: string,
): Promise<string> {
  const roles = await listRoles(token, guildId);
  const member = roles.find((r) => r.name === MEMBER_ROLE_NAME);
  if (member) {
    // Keep permissions safe if someone elevated them by mistake.
    if (member.permissions && member.permissions !== "0") {
      await discordJson(token, `/guilds/${guildId}/roles/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: "0" }),
      }).catch(() => undefined);
    }
    return member.id;
  }

  const legacy = roles.find((r) => r.name === LEGACY_MEMBER_ROLE_NAME);
  if (legacy) {
    await discordJson(token, `/guilds/${guildId}/roles/${legacy.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: MEMBER_ROLE_NAME,
        permissions: "0",
        mentionable: false,
        color: MEMBER_ROLE_COLOR,
      }),
    });
    return legacy.id;
  }

  return ensureNamedRole(
    token,
    guildId,
    MEMBER_ROLE_NAME,
    MEMBER_ROLE_COLOR,
    false,
  );
}

export async function ensureUpdatesRole(
  token: string,
  guildId: string,
): Promise<string> {
  return ensureNamedRole(token, guildId, "Updates", 0x5865f2, true);
}

export type RoleGrantResult = { ok: true } | { ok: false; error: string };

/** Grant Member if missing. Returns failure reason (hierarchy, missing Manage Roles, etc.). */
export async function ensureMemberHasRole(
  env: Env,
  guildId: string,
  userId: string,
  memberRoles?: string[],
): Promise<RoleGrantResult> {
  try {
    let roleId = env.memberRoleId;
    if (!roleId) {
      roleId = await ensureMemberRole(env.token, guildId);
      await saveVaultSetting("DISCORD_MEMBER_ROLE_ID", roleId);
      env.memberRoleId = roleId;
    }
    if (memberRoles?.includes(roleId)) return { ok: true };
    await discordJson(
      env.token,
      `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
      { method: "PUT" },
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("ensureMemberHasRole failed:", msg);
    return {
      ok: false,
      error:
        "Couldn't assign the **Member** role. Put the bot’s role above **Member** in Server Settings → Roles, and keep Manage Roles enabled.",
    };
  }
}

/** @deprecated alias — prefer ensureMemberHasRole */
export const ensureMemberHasSignal = ensureMemberHasRole;

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

  const memberGrant = await ensureMemberHasRole(
    env,
    guildId,
    user.id,
    interaction.member?.roles,
  );

  let roleId = env.updatesRoleId;
  if (!roleId) {
    roleId = await ensureUpdatesRole(env.token, guildId);
    await saveVaultSetting("DISCORD_UPDATES_ROLE_ID", roleId);
    env.updatesRoleId = roleId;
  }

  try {
    const hasRole = interaction.member?.roles?.includes(roleId);
    if (hasRole) {
      await discordJson(
        env.token,
        `/guilds/${guildId}/members/${user.id}/roles/${roleId}`,
        { method: "DELETE" },
      );
      await editOriginal(env.token, env.applicationId, interaction.token, {
        content: [
          "Update pings off — you won't be mentioned when we post site updates. Tap again anytime to turn them back on.",
          memberGrant.ok ? "" : memberGrant.error,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      return;
    }

    await discordJson(
      env.token,
      `/guilds/${guildId}/members/${user.id}/roles/${roleId}`,
      { method: "PUT" },
    );

    await editOriginal(env.token, env.applicationId, interaction.token, {
      content: [
        "You're set — you'll get pinged for site updates. Tap **Update pings** again to turn them off.",
        memberGrant.ok ? "" : memberGrant.error,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("handleClaimUpdatesRole failed:", msg);
    await editOriginal(env.token, env.applicationId, interaction.token, {
      content:
        "Couldn't update your **Updates** role. Put the bot’s role above **Updates** in Server Settings → Roles.",
    });
  }
}

/** Old welcome button — still grants Member if someone clicks it */
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

  const grant = await ensureMemberHasRole(
    env,
    guildId,
    user.id,
    interaction.member?.roles,
  );
  await editOriginal(env.token, env.applicationId, interaction.token, {
    content: grant.ok
      ? "You're in — **Member** is set. For update notifications, tap **Update pings** on the welcome message."
      : grant.error,
  });
}
