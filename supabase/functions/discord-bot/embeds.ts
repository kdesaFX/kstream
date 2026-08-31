/** Single dark aesthetic — matches Creator Coaster (no rainbow side bars). */
export const BRAND = {
  /** Left border for every embed — dark, blends with Discord night theme */
  color: 0x111214,
  site: "https://kdesa.stream",
  /** Same Worker — use when school/work filters block kdesa.stream */
  schoolMirror: "https://kstream.kdesabiz.workers.dev",
  /** Prefer attached file in refresh script; site URL for edge posts */
  banner: "https://kdesa.stream/discord-banner.jpg?v=3",
};

type ChannelIds = {
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
  const support = ch(ids.support, "#🛠️・support");
  const updates = ch(ids.updates, "#📢・updates");

  return [
    bannerEmbed(),
    {
      title: "Welcome to kdesa.stream!",
      description: [
        "Support server for **kdesa.stream** — movies, TV, manga, and help when something breaks.",
        "",
        `• ${support} — tickets for bugs or account issues`,
        `• ${updates} — site changes`,
        "",
        "Everyone gets the **Member** role automatically when they join.",
        "Want pings when we post site updates? Tap **Update pings** below (you can turn it off anytime).",
        "",
        `Site: ${BRAND.site}`,
        `School / filtered Wi‑Fi: ${BRAND.schoolMirror}`,
      ].join("\n"),
      color: BRAND.color,
      footer: { text: "kdesa.stream" },
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
          label: "Update pings",
          emoji: { name: "🔔" },
          custom_id: "claim_updates_role",
        },
        { type: 2, style: 5, label: "Website", url: BRAND.site },
        {
          type: 2,
          style: 5,
          label: "School Wi‑Fi?",
          url: BRAND.schoolMirror,
        },
      ],
    },
  ];
}

/** @deprecated kept empty — welcome is a single embed now */
export function infoEmbeds(_ids: ChannelIds = {}) {
  return [];
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
        `School / filtered Wi‑Fi blocking the main site? Try **${BRAND.schoolMirror}** (same app).`,
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
          value: "Report a member or something that broke server guidelines.",
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
        {
          type: 2,
          style: 5,
          label: "School Wi‑Fi?",
          url: BRAND.schoolMirror,
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
