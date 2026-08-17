import classNames from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { mangaChapterLink } from "@/backend/manga/ids";
import { chapterLabel, getMangaDetails } from "@/backend/manga/mangadex";
import type { MangaDetails } from "@/backend/manga/types";
import { mangaStatusKey } from "@/backend/manga/types";
import { Button } from "@/components/buttons/Button";
import { IconPatch } from "@/components/buttons/IconPatch";
import { Icons } from "@/components/Icon";
import { MangaImage } from "@/components/media/MangaImage";
import { OverlayPortal } from "@/components/overlays/OverlayDisplay";
import { Heading2 } from "@/components/utils/Text";
import { useOverlayStack } from "@/stores/interface/overlayStack";
import { useMangaProgressStore } from "@/stores/mangaProgress";
import { usePreferencesStore } from "@/stores/preferences";

export function MangaDetailsModal({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hideModal, isModalVisible, modalStack, getModalData } =
    useOverlayStack();
  const preferredLanguage = usePreferencesStore(
    (s) => s.mangaPreferredLanguage,
  );
  const progress = useMangaProgressStore((s) => s.items);

  const [loaded, setLoaded] = useState<{
    mangaId: string;
    details: MangaDetails;
  } | null>(null);
  const [failed, setFailed] = useState<{
    mangaId: string;
    message: string;
  } | null>(null);

  const modalIndex = modalStack.indexOf(id);
  const zIndex = modalIndex >= 0 ? 1000 + modalIndex : 999;
  const hide = useCallback(() => hideModal(id), [hideModal, id]);
  const isShown = isModalVisible(id);
  const modalData = getModalData(id);
  const mangaId = String(modalData?.mangaId ?? modalData?.id ?? "");
  const shouldShow = Boolean(isShown && mangaId);

  // One instance of this modal serves every title, so what it holds has to be
  // stamped with the manga it belongs to. Reading it back by id means opening
  // Vagabond can't show the Berserk it happens to still be holding.
  const details = loaded?.mangaId === mangaId ? loaded.details : null;
  const error = failed?.mangaId === mangaId ? failed.message : null;
  const isLoading = !details && !error;

  useEffect(() => {
    if (!shouldShow || !mangaId) return undefined;
    let cancelled = false;
    getMangaDetails(mangaId, preferredLanguage)
      .then((d) => {
        if (!cancelled) setLoaded({ mangaId, details: d });
      })
      .catch((e) => {
        if (!cancelled) {
          setFailed({
            mangaId,
            message: e instanceof Error ? e.message : "Failed to load",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shouldShow, mangaId, preferredLanguage]);

  const resume = progress[mangaId];
  const statusKey = details ? mangaStatusKey(details.status) : null;
  const startChapterId = useMemo(() => {
    if (resume?.chapterId) return resume.chapterId;
    return details?.chapters[0]?.id;
  }, [resume, details]);

  const openReader = () => {
    if (!details || !startChapterId) return;
    hide();
    navigate(mangaChapterLink(details.id, details.title, startChapterId));
  };

  if (!shouldShow) return null;

  return (
    <OverlayPortal
      darken
      close={hide}
      show={shouldShow}
      durationClass="duration-500"
      zIndex={zIndex}
    >
      <Helmet>
        <title>
          {details?.title
            ? `${details.title} - ${t("global.name")}`
            : t("global.name")}
        </title>
      </Helmet>
      <div
        className="absolute inset-0 flex items-start justify-center overflow-y-auto py-8 px-4"
        style={{ zIndex }}
      >
        <div
          className="relative w-full max-w-3xl rounded-2xl bg-background-main border border-utils-divider overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="absolute top-3 right-3 z-20"
            onClick={hide}
          >
            <IconPatch icon={Icons.X} clickable />
          </button>

          {isLoading ? (
            <div className="p-10 text-center text-type-secondary">
              {t("manga.details.loading")}
            </div>
          ) : null}
          {error ? (
            <div className="p-10 text-center text-red-400">{error}</div>
          ) : null}
          {details ? (
            <>
              <div className="relative h-48 md:h-64 bg-background-secondary">
                {details.poster ? (
                  <MangaImage
                    src={details.poster}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-40"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-background-main to-transparent" />
                <div className="absolute bottom-4 left-4 right-16 flex gap-4 items-end">
                  {details.poster ? (
                    <MangaImage
                      src={details.poster}
                      alt=""
                      className="w-24 md:w-32 rounded-lg shadow-lg"
                    />
                  ) : null}
                  <div>
                    <Heading2 className="!mt-0 !mb-1 text-white">
                      {details.title}
                    </Heading2>
                    <p className="text-sm text-type-secondary">
                      {[
                        statusKey ? t(statusKey) : null,
                        details.year,
                        details.rating
                          ? `★ ${details.rating.toFixed(1)}`
                          : null,
                        details.follows
                          ? `${details.follows.toLocaleString()} follows`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {details.description ? (
                  <p className="text-type-text text-sm leading-relaxed line-clamp-6">
                    {details.description}
                  </p>
                ) : (
                  <p className="text-type-secondary text-sm italic">
                    {t("manga.details.noDescription")}
                  </p>
                )}

                {details.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {details.tags.slice(0, 12).map((tag) => (
                      <span
                        key={tag.id}
                        className="text-xs px-2 py-1 rounded-full bg-background-secondary text-type-secondary"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Licensed titles list only external chapters, so there is
                    nothing here to open — say so instead of offering a button
                    that goes nowhere. */}
                {startChapterId ? (
                  <div className="flex gap-3">
                    <Button theme="purple" onClick={openReader}>
                      {resume
                        ? t("manga.details.continue")
                        : t("manga.details.read")}
                    </Button>
                  </div>
                ) : null}

                <div>
                  <h3 className="text-sm font-semibold mb-2 text-white">
                    {t("manga.details.chapters")}
                  </h3>
                  <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {details.chapters.length === 0 ? (
                      <p className="text-sm text-type-secondary">
                        {t("manga.details.noChapters")}
                      </p>
                    ) : (
                      details.chapters.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          className={classNames(
                            "w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-background-secondary transition-colors",
                            resume?.chapterId === ch.id &&
                              "bg-background-secondary text-type-link",
                          )}
                          onClick={() => {
                            hide();
                            navigate(
                              mangaChapterLink(
                                details.id,
                                details.title,
                                ch.id,
                              ),
                            );
                          }}
                        >
                          {chapterLabel(ch)}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </OverlayPortal>
  );
}
