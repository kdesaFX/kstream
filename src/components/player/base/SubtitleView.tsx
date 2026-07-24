import { useMemo } from "react";

import {
  captionIsVisible,
  makeQueId,
  parseSubtitles,
  sanitize,
} from "@/components/player/utils/captions";
import { TTMLCue } from "@/components/player/utils/ttml";
import { useCasting } from "@/components/player/casting/useCasting";
import { Transition } from "@/components/utils/Transition";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { SubtitleStyling, useSubtitleStore } from "@/stores/subtitles";

export const wordOverrides: Record<string, string> = {
  // Example: i: "I", but in polish "i" is "and" so this is disabled.
};

export function CaptionCue({
  text,
  styling,
  overrideCasing,
}: {
  text?: string;
  styling: SubtitleStyling;
  overrideCasing: boolean;
}) {
  const parsedHtml = useMemo(() => {
    let textToUse = text;
    if (overrideCasing && text) {
      textToUse = text.slice(0, 1) + text.slice(1).toLowerCase();
    }

    const textWithNewlines = (textToUse || "")
      .split(" ")
      .map((word) => wordOverrides[word] ?? word)
      .join(" ")
      .replaceAll(/ i'/g, " I'")
      .replaceAll(/\r?\n/g, "<br />");

    // https://www.w3.org/TR/webvtt1/#dom-construction-rules
    // added a <br /> for newlines
    const html = sanitize(textWithNewlines, {
      ALLOWED_TAGS: ["c", "b", "i", "u", "span", "ruby", "rt", "br"],
      ADD_TAGS: ["v", "lang"],
      ALLOWED_ATTR: ["title", "lang"],
    });

    return html;
  }, [text, overrideCasing]);

  const getTextEffectStyles = () => {
    switch (styling.fontStyle) {
      case "raised":
        return {
          textShadow: "0 2px 0 rgba(0,0,0,0.8), 0 1.5px 1.5px rgba(0,0,0,0.9)",
        };
      case "depressed":
        return {
          textShadow:
            "0 -2px 0 rgba(0,0,0,0.8), 0 -1.5px 1.5px rgba(0,0,0,0.9)",
        };
      case "Border": {
        const thickness = Math.max(
          0.5,
          Math.min(5, styling.borderThickness || 1),
        );
        const shadowColor = "rgba(0,0,0,0.8)";
        return {
          textShadow: [
            `${thickness}px ${thickness}px 0 ${shadowColor}`,
            `-${thickness}px ${thickness}px 0 ${shadowColor}`,
            `${thickness}px -${thickness}px 0 ${shadowColor}`,
            `-${thickness}px -${thickness}px 0 ${shadowColor}`,
            `${thickness}px 0 0 ${shadowColor}`,
            `-${thickness}px 0 0 ${shadowColor}`,
            `0 ${thickness}px 0 ${shadowColor}`,
            `0 -${thickness}px 0 ${shadowColor}`,
          ].join(", "),
        };
      }
      case "dropShadow":
        return { textShadow: "2.5px 2.5px 4.5px rgba(0,0,0,0.9)" };
      case "default":
      default:
        return { textShadow: "0 2px 4px rgba(0,0,0,0.5)" }; // Default is a light drop shadow
    }
  };

  const textEffectStyles = getTextEffectStyles();

  return (
    <p
      className="mb-1 rounded px-4 py-1 text-center"
      style={{
        color: styling.color,
        fontSize: `${(1.5 * styling.size).toFixed(2)}em`,
        backgroundColor: `rgba(0,0,0,${styling.backgroundOpacity.toFixed(2)})`,
        backdropFilter:
          styling.backgroundBlurEnabled && styling.backgroundBlur !== 0
            ? `blur(${Math.floor(styling.backgroundBlur * 64)}px)`
            : "none",
        fontWeight: styling.bold ? "bold" : "normal",
        lineHeight: styling.lineHeight ?? 1.5,
        ...textEffectStyles,
      }}
    >
      <span
        // Sanitised a few lines up
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: parsedHtml,
        }}
        dir="ltr"
      />
    </p>
  );
}

export function SubtitleRenderer() {
  const videoTime = usePlayerStore((s) => s.progress.time);
  const srtData = usePlayerStore((s) => s.caption.selected?.srtData);
  const language = usePlayerStore((s) => s.caption.selected?.language);
  const styling = useSubtitleStore((s) => s.styling);
  const overrideCasing = useSubtitleStore((s) => s.overrideCasing);
  const delay = useSubtitleStore((s) => s.delay);

  const parsedCaptions = useMemo(
    () => (srtData ? parseSubtitles(srtData, language) : []),
    [srtData, language],
  );

  const visibleCaptions = useMemo(
    () =>
      parsedCaptions.filter(({ start, end }) =>
        captionIsVisible(start, end, delay, videoTime),
      ),
    [parsedCaptions, videoTime, delay],
  );

  return (
    <div>
      {visibleCaptions.map(({ start, end, content }, i) => (
        <CaptionCue
          key={makeQueId(i, start, end)}
          text={content}
          styling={styling}
          overrideCasing={overrideCasing}
        />
      ))}
    </div>
  );
}

const displayAlignToJustify: Record<TTMLCue["displayAlign"], string> = {
  before: "flex-start",
  center: "center",
  after: "flex-end",
};

function textAlignToItems(textAlign: string): string {
  if (textAlign === "left") return "flex-start";
  if (textAlign === "right") return "flex-end";
  return "center";
}

function TTMLCueBox({ cue, sizeScale }: { cue: TTMLCue; sizeScale: number }) {
  const outline =
    cue.outlinePx > 0
      ? [-1, 1].flatMap((dx) =>
          [-1, 1].map(
            (dy) =>
              `${dx * cue.outlinePx}px ${dy * cue.outlinePx}px 0 ${cue.outlineColor}`,
          ),
        )
      : [];

  return (
    <div
      className="absolute pointer-events-none flex"
      style={{
        left: `${cue.originXPct}%`,
        top: `${cue.originYPct}%`,
        width: `${cue.extentWPct}%`,
        height: `${cue.extentHPct}%`,
        justifyContent: displayAlignToJustify[cue.displayAlign],
        alignItems: textAlignToItems(cue.textAlign),
        textAlign: cue.textAlign as any,
      }}
    >
      <span
        className="inline-block px-1 leading-tight"
        style={{
          color: cue.color,
          fontFamily: cue.fontFamily,
          fontWeight: cue.fontWeight,
          fontSize: `${(1.3 * sizeScale).toFixed(2)}em`,
          backgroundColor:
            cue.backgroundColor === "transparent"
              ? "transparent"
              : cue.backgroundColor,
          opacity: cue.opacity,
          textShadow: outline.join(", ") || undefined,
          whiteSpace: "pre-wrap",
        }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: cue.html }}
        dir="ltr"
      />
    </div>
  );
}

function TTMLSubtitleRenderer({ cues }: { cues: TTMLCue[] }) {
  const videoTime = usePlayerStore((s) => s.progress.time);
  const delay = useSubtitleStore((s) => s.delay);
  const styling = useSubtitleStore((s) => s.styling);

  const visibleCues = useMemo(
    () =>
      cues.filter(({ start, end }) =>
        captionIsVisible(start, end, delay, videoTime),
      ),
    [cues, videoTime, delay],
  );

  return (
    <div className="pointer-events-none z-50 absolute inset-0 overflow-hidden">
      {visibleCues.map((cue, i) => (
        <TTMLCueBox
          key={makeQueId(i, cue.start, cue.end)}
          cue={cue}
          sizeScale={styling.size}
        />
      ))}
    </div>
  );
}

export function SubtitleView(props: { controlsShown: boolean }) {
  const caption = usePlayerStore((s) => s.caption.selected);
  const source = usePlayerStore((s) => s.source);
  const { isCasting } = useCasting();
  const styling = useSubtitleStore((s) => s.styling);
  const enableNativeSubtitles = usePreferencesStore(
    (s) => s.enableNativeSubtitles,
  );
  const captionAsTrack = usePlayerStore((s) => s.caption.asTrack);

  const shouldUseNativeTrack = (enableNativeSubtitles || captionAsTrack) && source !== null;
  if (shouldUseNativeTrack || !caption || isCasting) return null;

  if (caption.ttmlCues && caption.ttmlCues.length > 0) {
    return <TTMLSubtitleRenderer cues={caption.ttmlCues} />;
  }

  return (
    <Transition animation="slide-up" show>
      <div
        className="pointer-events-none z-50 text-white absolute w-full flex flex-col items-center transition-[bottom]"
        style={{
          bottom: props.controlsShown
            ? "6rem"
            : `${styling.verticalPosition}rem`,
          transform: "translateZ(0)",
        }}
      >
        <SubtitleRenderer />
      </div>
    </Transition>
  );
}
