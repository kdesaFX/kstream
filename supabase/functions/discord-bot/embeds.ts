/** Single dark aesthetic — matches Creator Coaster (no rainbow side bars). */
export const BRAND = {
  /** Left border for every embed — dark, blends with Discord night theme */
  color: 0x111214,
  site: "https://kdesa.stream",
  /** Black + teal kstream signal banner */
  banner: "https://kdesa.stream/discord-banner.png?v=2",
};

type ChannelIds = {
  rules?: string;
  welcome?: string;
  updates?: string;
  support?: string;
};

function ch(id: string | undefined, fallback: string) {
  return id ? `<#${id}>` : fallback;
}

export function bannerEmbed() {
  return {
    color: BRAND.color,
    image: { url: BRAND.banner },
  };
}

export function welcomeEmbeds(ids: ChannelIds = {}) {
  const rules = ch(ids.rules, "#📜・rules");
  const support = ch(ids.support, "#🛠️・support");
  const updates = ch(ids.updates, "#📢・updates");

  return [
    bannerEmbed(),
    {
      title: "Welcome to kdesa.stream!",
      description: [
        "Your hub for streaming movies & shows, browsing manga, and getting help when something breaks.",
        "",
        "Tap **Get Signal** below to pick up the member role.",
        "",
        "**Important Channels:**",
        `• **Rules** — ${rules}`,
        `• **Support** — ${support}`,
        `• **Updates** — ${updates}`,
        "",
        `Jump in on the site anytime: **${BRAND.site}**`,
      ].join("\n"),
      color: BRAND.color,
      footer: { text: "kdesa.stream community" },
    },
  ];
}

export function welcomeComponents() {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1,
          label: "Get Signal",
          emoji: { name: "📡" },
          custom_id: "claim_member_role",
        },
        { type: 2, style: 5, label: "Website", url: BRAND.site },
        { type: 2, style: 5, label: "Browse", url: `${BRAND.site}/browse` },
      ],
    },
  ];
}

export function rulesEmbeds() {
  return [
    bannerEmbed(),
    {
      title: "kdesa.stream Rules",
      description: [
        "Follow these so the server stays chill. Staff usually start with warnings.",
        "",
        "**Warning System:**",
        "• **1st** — Warning",
        "• **2nd** — Warning",
        "• **3rd** — Warning + 1 day mute",
        "• **4th** — Warning + 3 day mute",
        "• **5th** — Warning + 3 day ban",
        "• **6th** — Warning + 14 day ban",
        "• **7th** — Permanent ban",
        "",
        "**Note:** Warns expire after **3 months** — they're not forever.",
      ].join("\n"),
      color: BRAND.color,
    },
    {
      title: "Warnable Offenses",
      description: [
        "• Be respectful — no harassment, slurs, or drama.",
        "• No spam, raids, or mass-pinging.",
        "• No self-promo / unsolicited links without staff OK.",
        "• Don't share account credentials or try to bypass site limits.",
        "• Don't ask for / share illegal download how-tos.",
        "• Keep tickets on-topic (site bugs, account help, reports).",
        "• No inappropriate reactions or NSFW content.",
        "• Don't ghost-ping or excessively tag people/roles.",
        "• Staff decisions are final — argue in a ticket, not in chat.",
      ].join("\n"),
      color: BRAND.color,
    },
  ];
}

export function infoEmbeds(ids: ChannelIds = {}) {
  const rules = ch(ids.rules, "#📜・rules");
  const support = ch(ids.support, "#🛠️・support");
  const updates = ch(ids.updates, "#📢・updates");

  return [
    {
      title: "Start Here",
      description: [
        "**Information**",
        "This server is for kdesa.stream — streaming, manga, and support.",
        `Questions about the site? Open a ticket in ${support}.`,
        "",
        "**Rules**",
        `⤷ ${rules}`,
        "General rules for the whole server.",
        "",
        "**Updates**",
        `⤷ ${updates}`,
        "Site changes and announcements (no random pings — we tell you when).",
        "",
        "**Support**",
        `⤷ ${support}`,
        "Bugs, account issues, and reports via ticket buttons.",
      ].join("\n"),
      color: BRAND.color,
    },
  ];
}

export function supportPanelEmbeds(ids: ChannelIds = {}) {
  const updates = ch(ids.updates, "#📢・updates");

  return [
    bannerEmbed(),
    {
      title: "Contact Support",
      description: [
        "Need help with **kdesa.stream**? Open a private ticket below.",
        "",
        "**NOTE:** Tickets are for site/account issues and reports — not random chat. Misuse may get a warning.",
        "",
        `Site news lives in ${updates}.`,
      ].join("\n"),
      color: BRAND.color,
      fields: [
        {
          name: "🛠️ General Support",
          value: "Bugs, playback issues, manga loading, account/login help.",
          inline: false,
        },
        {
          name: "🛡️ Report",
          value: "Report a member or something that broke the rules.",
          inline: false,
        },
      ],
    },
  ];
}

export function supportPanelComponents() {
  return [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: "Support Ticket",
          emoji: { name: "🛠️" },
          custom_id: "ticket_open_support",
        },
        {
          type: 2,
          style: 2,
          label: "Report Ticket",
          emoji: { name: "🛡️" },
          custom_id: "ticket_open_report",
        },
      ],
    },
  ];
}

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
    color: BRAND.color,
    footer: authorName
      ? { text: `Posted by ${authorName}` }
      : { text: "kdesa.stream updates" },
    timestamp: new Date().toISOString(),
  };
}

export function ticketOpenEmbed(
  subject: string,
  openerMention: string,
  kind: "support" | "report" = "support",
) {
  const title = kind === "report" ? "Report ticket" : "Support ticket";
  return {
    title,
    description: [
      `${openerMention} opened this ticket.`,
      subject ? `\n**Subject:** ${subject}` : "",
      "",
      kind === "report"
        ? "Describe who/what you're reporting and include links or screenshots if you can."
        : "Describe your issue here. Staff will reply when they can.",
      "",
      "Use **Close ticket** below or `/ticket-close` when you're done.",
    ].join("\n"),
    color: BRAND.color,
  };
}
