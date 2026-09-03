import classNames from "classnames";
import { useTranslation } from "react-i18next";

import { Icon, Icons } from "@/components/Icon";

const ALL_HOME_SECTIONS = ["watching", "reading", "bookmarks"] as const;
export type HomeSectionId = (typeof ALL_HOME_SECTIONS)[number];

export { ALL_HOME_SECTIONS };

function PosterStrip({
  count,
  carousel,
}: {
  count: number;
  carousel: boolean;
}) {
  return (
    <div
      className={classNames(
        "flex gap-1.5",
        carousel ? "overflow-hidden" : "flex-wrap",
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={classNames(
            "rounded-sm bg-white/15 shrink-0",
            carousel ? "h-10 w-7" : "h-9 w-6",
          )}
        />
      ))}
      {carousel ? (
        <div className="h-10 w-4 shrink-0 rounded-sm bg-white/5" />
      ) : null}
    </div>
  );
}

function PreviewSection({
  label,
  icon,
  posterCount,
  carousel,
}: {
  label: string;
  icon: Icons;
  posterCount: number;
  carousel: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
        <Icon icon={icon} className="text-[11px] text-type-logo" />
        <span className="truncate">{label}</span>
      </div>
      <PosterStrip count={posterCount} carousel={carousel} />
    </div>
  );
}

const SECTION_META: Record<
  HomeSectionId,
  { icon: Icons; posters: number }
> = {
  watching: { icon: Icons.CLOCK, posters: 5 },
  reading: { icon: Icons.BOOK, posters: 4 },
  bookmarks: { icon: Icons.BOOKMARK, posters: 6 },
};

export function HomeLayoutPreview(props: {
  homeSectionOrder: string[];
  enableDiscover: boolean;
  enableCarouselView: boolean;
  enableFeatured?: boolean;
}) {
  const { t } = useTranslation();
  const enabled = props.homeSectionOrder.filter((id): id is HomeSectionId =>
    (ALL_HOME_SECTIONS as readonly string[]).includes(id),
  );

  return (
    <div className="space-y-2">
      <p className="text-sm text-type-secondary leading-snug">
        {t("settings.appearance.options.homeLayoutPreview")}
      </p>
      <div
        className="rounded-xl bg-black/40 ring-1 ring-white/10 overflow-hidden shadow-lg"
        aria-hidden
      >
        {/* Fake browser chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border-b border-white/5">
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          <span className="ml-2 flex-1 h-4 rounded bg-white/5" />
        </div>

        <div className="p-3 space-y-3">
          {/* Hero */}
          <div className="relative h-16 rounded-lg overflow-hidden bg-gradient-to-br from-type-logo/30 via-white/10 to-black/40 ring-1 ring-white/10">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(255,255,255,0.12),transparent_55%)]" />
            <div className="absolute bottom-2 left-2 right-10 space-y-1">
              <div className="h-2.5 w-20 rounded bg-white/70" />
              <div className="h-1.5 w-28 rounded bg-white/30" />
            </div>
            <div className="absolute top-2 left-2 h-4 w-4 rounded bg-type-logo/80" />
          </div>

          {enabled.length === 0 ? (
            <p className="text-xs text-type-secondary text-center py-4">
              {t("settings.appearance.options.homeLayoutPreviewEmpty")}
            </p>
          ) : (
            enabled.map((id) => (
              <PreviewSection
                key={id}
                label={t(`settings.appearance.sections.${id}`)}
                icon={SECTION_META[id].icon}
                posterCount={SECTION_META[id].posters}
                carousel={props.enableCarouselView}
              />
            ))
          )}

          {props.enableDiscover ? (
            <div className="space-y-1.5 pt-1 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                <Icon icon={Icons.SEARCH} className="text-[11px]" />
                <span>{t("settings.appearance.options.discoverLabel")}</span>
              </div>
              <div className="flex gap-1">
                {["Movies", "TV", "Manga"].map((tab) => (
                  <span
                    key={tab}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] text-white/60"
                  >
                    {tab}
                  </span>
                ))}
              </div>
              <PosterStrip count={7} carousel />
            </div>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-type-secondary/80 leading-snug">
        {props.enableCarouselView
          ? t("settings.appearance.options.homeLayoutPreviewCarousel")
          : t("settings.appearance.options.homeLayoutPreviewGrid")}
      </p>
    </div>
  );
}

export function buildHomeSectionToggleItems(
  order: string[],
  labelFor: (id: HomeSectionId) => string,
) {
  const enabled = order.filter((id): id is HomeSectionId =>
    (ALL_HOME_SECTIONS as readonly string[]).includes(id),
  );
  const enabledItems = enabled.map((id) => ({
    id,
    name: labelFor(id),
    enabled: true,
  }));
  const disabledItems = ALL_HOME_SECTIONS.filter(
    (id) => !order.includes(id),
  ).map((id) => ({
    id,
    name: labelFor(id),
    enabled: false,
  }));
  return [...enabledItems, ...disabledItems];
}
