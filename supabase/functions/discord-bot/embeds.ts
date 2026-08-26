type UpdateType = "small" | "big";

export function updateEmbed(
  title: string,
  description: string,
  type: UpdateType,
  authorName?: string,
) {
  const isBig = type === "big";
  return {
    title: isBig ? `🚀 ${title}` : `📌 ${title}`,
    description,
    color: isBig ? 0x5865f2 : 0x57f287,
    footer: authorName
      ? { text: `Posted by ${authorName}` }
      : { text: "kdesa.stream updates" },
    timestamp: new Date().toISOString(),
  };
}

export function ticketOpenEmbed(subject: string, openerMention: string) {
  return {
    title: "Support ticket",
    description: [
      `${openerMention} opened this ticket.`,
      subject ? `\n**Subject:** ${subject}` : "",
      "",
      "Describe your issue here. Staff will reply when they can.",
      "Use **Close ticket** below or `/ticket-close` when you're done.",
    ].join("\n"),
    color: 0xfee75c,
  };
}

export function welcomeEmbed() {
  return {
    title: "Welcome to kdesa.stream",
    description: [
      "Thanks for joining the community server.",
      "",
      "• Read the rules in <#RULES>",
      "• Site issues or account help → open a ticket in <#SUPPORT>",
      "• Site updates get posted in <#UPDATES>",
      "",
      "Stream, browse manga, and hang out: **https://kdesa.stream**",
    ].join("\n"),
    color: 0x5865f2,
  };
}

export function rulesEmbed() {
  return {
    title: "Server rules",
    description: [
      "1. Be respectful — no harassment, slurs, or drama.",
      "2. No spam, self-promo, or unsolicited links.",
      "3. Don't share illegal streams, leaks, or piracy how-tos.",
      "4. Support tickets are for site/account issues — keep them on-topic.",
      "5. Staff decisions are final.",
      "",
      "Breaking rules may result in mutes or bans.",
    ].join("\n"),
    color: 0xed4245,
  };
}

export function replaceChannelPlaceholders(
  embed: ReturnType<typeof welcomeEmbed>,
  ids: { rules?: string; support?: string; updates?: string },
) {
  let description = embed.description ?? "";
  if (ids.rules) description = description.replace("<#RULES>", `<#${ids.rules}>`);
  if (ids.support) {
    description = description.replace("<#SUPPORT>", `<#${ids.support}>`);
  }
  if (ids.updates) {
    description = description.replace("<#UPDATES>", `<#${ids.updates}>`);
  }
  return { ...embed, description };
}
