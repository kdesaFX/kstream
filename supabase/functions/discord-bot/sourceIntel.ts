import {
  type Interaction,
  discordJson,
  editOriginal,
  ephemeral,
  hasAdmin,
} from "./discord.ts";
import { type Env } from "./roles.ts";
import {
  classifyLink,
  extractUrlsFromText,
  hostFromUrl,
  listRecentLinks,
  scanChannelForLinks,
  upsertDiscoveredLinks,
} from "./links.ts";

function optionString(
  interaction: Interaction,
  name: string,
): string | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  return typeof opt?.value === "string" ? opt.value : undefined;
}

function optionInt(
  interaction: Interaction,
  name: string,
): number | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  return typeof opt?.value === "number" ? opt.value : undefined;
}

function optionChannelId(interaction: Interaction, name: string): string | undefined {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  return typeof opt?.value === "string" ? opt.value : undefined;
}

function isStaff(interaction: Interaction, env: Env): boolean {
  if (hasAdmin(interaction)) return true;
  if (!env.staffRoleId) return hasAdmin(interaction);
  return interaction.member?.roles.includes(env.staffRoleId) ?? false;
}

export function isDeferredSourceIntelCommand(interaction: Interaction): boolean {
  const name = interaction.data?.name;
  return name === "scan-channel" || name === "scan-server";
}

export function handleSourceIntelDeferred(
  interaction: Interaction,
  env: Env,
): { type: number; data?: { flags: number } } {
  return { type: 5, data: { flags: 64 } };
}

export async function runSourceIntelDeferred(
  interaction: Interaction,
  env: Env,
): Promise<void> {
  const name = interaction.data?.name;
  if (!interaction.guild_id) {
    await editOriginal(env.token, env.applicationId, interaction.token, {
      content: "This command only works in a server.",
    });
    return;
  }

  if (!isStaff(interaction, env)) {
    await editOriginal(env.token, env.applicationId, interaction.token, {
      content: "Staff or administrator only.",
    });
    return;
  }

  try {
    if (name === "scan-channel") {
      const channelId =
        optionChannelId(interaction, "channel") ?? interaction.channel_id;
      const limit = optionInt(interaction, "limit") ?? 500;
      if (!channelId) {
        await editOriginal(env.token, env.applicationId, interaction.token, {
          content: "Could not resolve channel.",
        });
        return;
      }

      const result = await scanChannelForLinks(
        env.token,
        interaction.guild_id,
        channelId,
        limit,
      );

      const lines = [
        `**Channel scan complete**`,
        `Messages read: **${result.messages}**`,
        `Unique links: **${result.links}** (${result.inserted} new)`,
      ];
      if (result.topDomains.length) {
        lines.push("", "**Top domains:**", result.topDomains.map((d) => `• ${d}`).join("\n"));
      }
      lines.push(
        "",
        "Use `/source-links` to browse. Export with `node discord-bot/scripts/export-discord-links.mjs`.",
      );

      await editOriginal(env.token, env.applicationId, interaction.token, {
        content: lines.join("\n"),
      });
      return;
    }

    if (name === "scan-server") {
      const limit = optionInt(interaction, "limit") ?? 300;
      const channels = await discordJson<
        Array<{ id: string; type: number; name: string }>
      >(env.token, `/guilds/${interaction.guild_id}/channels`);

      const textChannels = channels.filter((c) => c.type === 0).slice(0, 12);
      let totalLinks = 0;
      let totalInserted = 0;
      let totalMessages = 0;
      const domainTotals = new Map<string, number>();

      for (const channel of textChannels) {
        const result = await scanChannelForLinks(
          env.token,
          interaction.guild_id,
          channel.id,
          limit,
        );
        totalLinks += result.links;
        totalInserted += result.inserted;
        totalMessages += result.messages;
        for (const entry of result.topDomains) {
          const domain = entry.split(" (")[0] ?? entry;
          const count = parseInt(entry.match(/\((\d+)\)/)?.[1] ?? "1", 10);
          domainTotals.set(domain, (domainTotals.get(domain) ?? 0) + count);
        }
      }

      const topDomains = [...domainTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => `• ${domain} (${count})`);

      await editOriginal(env.token, env.applicationId, interaction.token, {
        content: [
          `**Server scan complete** (${textChannels.length} text channels)`,
          `Messages: **${totalMessages}** · Links: **${totalLinks}** (${totalInserted} new)`,
          topDomains.length ? `\n**Top domains:**\n${topDomains.join("\n")}` : "",
        ].join("\n"),
      });
    }
  } catch (err) {
    await editOriginal(env.token, env.applicationId, interaction.token, {
      content: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export async function handleSourceLinks(
  interaction: Interaction,
  env: Env,
): Promise<Record<string, unknown>> {
  if (!interaction.guild_id) return ephemeral("This command only works in a server.");
  if (!isStaff(interaction, env)) return ephemeral("Staff or administrator only.");

  const domain = optionString(interaction, "domain");
  const limit = optionInt(interaction, "limit") ?? 15;

  const rows = await listRecentLinks({
    guildId: interaction.guild_id,
    domain,
    limit,
  });

  if (!rows.length) {
    return ephemeral(
      domain
        ? `No indexed links for \`${domain}\` yet. Try \`/scan-channel\` or \`/ingest-links\`.`
        : "No indexed links yet. Use `/scan-channel`, `/ingest-links`, or import a Discord data export.",
    );
  }

  const lines = rows.map((row) => {
    const tag = row.category !== "unknown" ? ` [${row.category}]` : "";
    const label = row.label ? ` (${row.label})` : "";
    return `• **${row.domain}**${tag}${label}\n  ${row.url}`;
  });

  return ephemeral(
    `**Recent source links** (${rows.length})\n\n${lines.join("\n\n")}`.slice(0, 1900),
  );
}

export async function handleIngestLinks(
  interaction: Interaction,
  env: Env,
): Promise<Record<string, unknown>> {
  if (!interaction.guild_id) return ephemeral("This command only works in a server.");
  if (!isStaff(interaction, env)) return ephemeral("Staff or administrator only.");

  const text = optionString(interaction, "text");
  const label = optionString(interaction, "label") ?? "manual-ingest";
  if (!text?.trim()) return ephemeral("Paste some text with URLs in the `text` option.");

  const urls = extractUrlsFromText(text);
  if (!urls.length) return ephemeral("No usable URLs found in that text.");

  const links = urls.map((url) => ({
    url,
    domain: hostFromUrl(url),
    category: classifyLink(url, text),
    label,
  }));

  const { inserted, total } = await upsertDiscoveredLinks({
    guildId: interaction.guild_id,
    links,
    source: "ingest",
    label,
  });

  return ephemeral(
    `Indexed **${total}** URLs (${inserted} new) under label \`${label}\`. Use \`/source-links\` to review.`,
  );
}
