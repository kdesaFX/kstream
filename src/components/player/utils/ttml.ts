import DOMPurify from "dompurify";

export interface TTMLCue {
  start: number; // ms
  end: number; // ms
  html: string;
  plainText: string;
  originXPct: number;
  originYPct: number;
  extentWPct: number;
  extentHPct: number;
  displayAlign: "before" | "center" | "after";
  textAlign: string;
  color: string;
  backgroundColor: string;
  fontFamily: string;
  fontWeight: string;
  outlinePx: number;
  outlineColor: string;
  opacity: number;
}

export function isTTML(text: string): boolean {
  const head = text.slice(0, 4096);
  return /<tt[\s>]/.test(head) && /["'](https?:\/\/)?www\.w3\.org\/ns\/ttml/.test(head);
}

const FONT_FAMILY_MAP: Record<string, string> = {
  default: "sans-serif",
  monospace: "monospace",
  sansSerif: "sans-serif",
  serif: "serif",
  monospaceSansSerif: "monospace",
  monospaceSerif: "monospace",
  proportionalSansSerif: "sans-serif",
  proportionalSerif: "serif",
};

const DISPLAY_ALIGNS = new Set(["before", "center", "after"]);

function parseTTMLTime(value: string | null, tickRate: number): number | null {
  if (!value) return null;
  const v = value.trim();

  const tickMatch = v.match(/^(\d+(?:\.\d+)?)t$/);
  if (tickMatch) return (parseFloat(tickMatch[1]) / tickRate) * 1000;

  const unitMatch = v.match(/^(\d+(?:\.\d+)?)(ms|h|m|s|f)$/);
  if (unitMatch) {
    const num = parseFloat(unitMatch[1]);
    switch (unitMatch[2]) {
      case "h":
        return num * 3600000;
      case "m":
        return num * 60000;
      case "s":
        return num * 1000;
      case "ms":
        return num;
      case "f":
        return num;
      default:
        return null;
    }
  }

  const clockMatch = v.match(/^(\d{2,}):(\d{2}):(\d{2})(?:[.,](\d+))?(?::(\d+))?$/);
  if (clockMatch) {
    const [, hh, mm, ss, ms] = clockMatch;
    const msVal = ms ? parseFloat(`0.${ms}`) * 1000 : 0;
    return (
      parseInt(hh, 10) * 3600000 +
      parseInt(mm, 10) * 60000 +
      parseInt(ss, 10) * 1000 +
      msVal
    );
  }

  return null;
}

function parsePercentPair(
  value: string | null,
): [number, number] | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const nums = parts.map((p) => parseFloat(p.replace("%", "")));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return [nums[0], nums[1]];
}

// tts:textOutline is "<color> <length>", length usually in rh (percent of
// root container height). No live layout access here, so it's approximated
// against a nominal 720px reference frame -- good enough for a visible,
// proportionate outline rather than exact IMSC conformance.
function parseOutline(value: string | null): { color: string; px: number } | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const color = parts[0];
  const lengthMatch = parts[1].match(/^(\d+(?:\.\d+)?)(rh|rw|px|%)?$/);
  if (!lengthMatch) return null;
  const num = parseFloat(lengthMatch[1]);
  const unit = lengthMatch[2] ?? "px";
  const px = unit === "rh" || unit === "rw" || unit === "%" ? (num / 100) * 720 : num;
  return { color, px };
}

interface ResolvedStyle {
  color: string;
  backgroundColor: string;
  textAlign: string;
  fontFamily: string;
  fontWeight: string;
  displayAlign: "before" | "center" | "after";
  outlinePx: number;
  outlineColor: string;
  opacity: number;
}

function readStyleAttrs(el: Element, into: Partial<ResolvedStyle>) {
  const color = el.getAttribute("tts:color");
  if (color) into.color = color;

  const bg = el.getAttribute("tts:backgroundColor");
  if (bg) into.backgroundColor = bg === "transparent" ? "transparent" : bg;

  const textAlign = el.getAttribute("tts:textAlign");
  if (textAlign) into.textAlign = textAlign === "start" ? "left" : textAlign === "end" ? "right" : textAlign;

  const fontFamily = el.getAttribute("tts:fontFamily");
  if (fontFamily) into.fontFamily = FONT_FAMILY_MAP[fontFamily] ?? fontFamily;

  const fontStyle = el.getAttribute("tts:fontStyle");
  const fontWeight = el.getAttribute("tts:fontWeight");
  if (fontWeight) into.fontWeight = fontWeight;
  if (fontStyle === "italic" || fontStyle === "oblique") {
    (into as any).fontStyleItalic = true;
  }

  const displayAlign = el.getAttribute("tts:displayAlign");
  if (displayAlign && DISPLAY_ALIGNS.has(displayAlign)) {
    into.displayAlign = displayAlign as ResolvedStyle["displayAlign"];
  }

  const outline = parseOutline(el.getAttribute("tts:textOutline"));
  if (outline) {
    into.outlinePx = outline.px;
    into.outlineColor = outline.color;
  }

  const opacity = el.getAttribute("tts:opacity");
  if (opacity) {
    const n = parseFloat(opacity);
    if (!Number.isNaN(n)) into.opacity = n;
  }
}

const ttmlSanitizeConfig = {
  ALLOWED_TAGS: ["i", "b", "span", "br"],
  ALLOWED_ATTR: ["style"],
};

function nodeToHtml(node: Node, italicStyleIds: Set<string>): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as Element;
  const tag = el.localName.toLowerCase();

  if (tag === "br") return "<br />";

  const inner = Array.from(el.childNodes)
    .map((child) => nodeToHtml(child, italicStyleIds))
    .join("");

  if (tag === "span") {
    const styleRef = el.getAttribute("style");
    const isItalic =
      el.getAttribute("tts:fontStyle") === "italic" ||
      (styleRef ? italicStyleIds.has(styleRef) : false);
    const color = el.getAttribute("tts:color");
    const styleAttr = color ? ` style="color:${color.replace(/"/g, "")}"` : "";
    const openTag = isItalic ? `<i${styleAttr}>` : styleAttr ? `<span${styleAttr}>` : "";
    const closeTag = isItalic ? "</i>" : styleAttr ? "</span>" : "";
    return `${openTag}${inner}${closeTag}`;
  }

  // p, div, or anything unrecognized: just flatten children.
  return inner;
}

export function parseTTML(xml: string): TTMLCue[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return [];

  const root = doc.documentElement;
  const tickRate = parseFloat(root.getAttribute("ttp:tickRate") ?? "") || 1;

  const initial: ResolvedStyle = {
    color: "white",
    backgroundColor: "transparent",
    textAlign: "center",
    fontFamily: "sans-serif",
    fontWeight: "normal",
    displayAlign: "after",
    outlinePx: 0,
    outlineColor: "black",
    opacity: 1,
  };
  const initialEl = doc.querySelector("styling > initial");
  if (initialEl) readStyleAttrs(initialEl, initial);

  const namedStyles = new Map<string, Partial<ResolvedStyle> & { fontStyleItalic?: boolean }>();
  const italicStyleIds = new Set<string>();
  doc.querySelectorAll("styling > style").forEach((styleEl) => {
    const id = styleEl.getAttribute("xml:id") ?? styleEl.getAttribute("id");
    if (!id) return;
    const partial: Partial<ResolvedStyle> & { fontStyleItalic?: boolean } = {};
    readStyleAttrs(styleEl, partial);
    namedStyles.set(id, partial);
    if (partial.fontStyleItalic) italicStyleIds.add(id);
  });

  interface RegionInfo {
    origin: [number, number];
    extent: [number, number];
    style: ResolvedStyle;
  }
  const regions = new Map<string, RegionInfo>();
  doc.querySelectorAll("layout > region").forEach((regionEl) => {
    const id = regionEl.getAttribute("xml:id") ?? regionEl.getAttribute("id");
    if (!id) return;
    const origin = parsePercentPair(regionEl.getAttribute("tts:origin")) ?? [10, 80];
    const extent = parsePercentPair(regionEl.getAttribute("tts:extent")) ?? [80, 15];
    const style: ResolvedStyle = { ...initial };
    readStyleAttrs(regionEl, style);
    regions.set(id, { origin, extent, style });
  });

  const cues: TTMLCue[] = [];
  doc.querySelectorAll("body p").forEach((p) => {
    const begin = parseTTMLTime(p.getAttribute("begin"), tickRate);
    const end = parseTTMLTime(p.getAttribute("end"), tickRate);
    if (begin === null || end === null) return;

    const regionId = p.getAttribute("region");
    const region = regionId ? regions.get(regionId) : undefined;

    const style: ResolvedStyle = region ? { ...region.style } : { ...initial };
    const styleRef = p.getAttribute("style");
    if (styleRef) {
      const named = namedStyles.get(styleRef);
      if (named) Object.assign(style, named);
    }
    readStyleAttrs(p, style);

    const rawHtml = Array.from(p.childNodes)
      .map((child) => nodeToHtml(child, italicStyleIds))
      .join("");
    const html = DOMPurify.sanitize(rawHtml, ttmlSanitizeConfig);
    const plainText = (p.textContent ?? "").trim();
    if (!plainText) return;

    const [originXPct, originYPct] = region?.origin ?? [10, 80];
    const [extentWPct, extentHPct] = region?.extent ?? [80, 15];

    cues.push({
      start: begin,
      end,
      html,
      plainText,
      originXPct,
      originYPct,
      extentWPct,
      extentHPct,
      displayAlign: style.displayAlign,
      textAlign: style.textAlign,
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      outlinePx: style.outlinePx,
      outlineColor: style.outlineColor,
      opacity: style.opacity,
    });
  });

  return cues.sort((a, b) => a.start - b.start);
}

function msToSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, ms);
  const hh = Math.floor(clamped / 3600000);
  const mm = Math.floor((clamped % 3600000) / 60000);
  const ss = Math.floor((clamped % 60000) / 1000);
  const mmm = Math.floor(clamped % 1000);
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)},${pad(mmm, 3)}`;
}

// Flattens parsed TTML cues into a plain SRT string, so every existing
// srtData-consuming codepath (previews, HLS merge, translation, etc.) keeps
// working for a TTML caption -- it just loses position/style, which the
// dedicated TTML renderer (using the cues themselves) restores.
export function ttmlCuesToSrt(cues: TTMLCue[]): string {
  return cues
    .map((cue, i) => {
      return `${i + 1}\n${msToSrtTimestamp(cue.start)} --> ${msToSrtTimestamp(cue.end)}\n${cue.plainText}\n`;
    })
    .join("\n");
}
