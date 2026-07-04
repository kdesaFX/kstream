import { ChangeEvent, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  LetterboxdImportItemResult,
  LetterboxdWatchlistRow,
  importLetterboxdWatchlist,
  parseLetterboxdWatchlist,
} from "@/backend/metadata/letterboxdImport";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { SettingsCard } from "@/components/layout/SettingsCard";
import { Divider } from "@/components/utils/Divider";
import { Heading1, Paragraph } from "@/components/utils/Text";
import { useBookmarkStore } from "@/stores/bookmarks";

type ImportStatus = "idle" | "parsing" | "ready" | "importing" | "done" | "error";

interface ImportSummary {
  added: number;
  duplicates: number;
  notfound: number;
  errors: number;
}

function summarize(results: LetterboxdImportItemResult[]): ImportSummary {
  return results.reduce<ImportSummary>(
    (acc, r) => {
      if (r.status === "added") acc.added += 1;
      else if (r.status === "duplicate") acc.duplicates += 1;
      else if (r.status === "notfound") acc.notfound += 1;
      else acc.errors += 1;
      return acc;
    },
    { added: 0, duplicates: 0, notfound: 0, errors: 0 },
  );
}

export function LetterboxdImportPart() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addBookmark = useBookmarkStore((s) => s.addBookmark);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<LetterboxdWatchlistRow[]>([]);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleFileButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setFileName(file.name);
      setSummary(null);
      setProgress({ done: 0, total: 0 });
      setStatus("parsing");

      try {
        const content = await file.text();
        const parsed = parseLetterboxdWatchlist(content);
        setRows(parsed);
        setStatus("ready");
      } catch (err) {
        setRows([]);
        setStatus("error");
      } finally {
        // Allow re-selecting the same file later.
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (rows.length === 0 || status === "importing") return;

    setStatus("importing");
    setProgress({ done: 0, total: rows.length });

    const results = await importLetterboxdWatchlist({
      rows,
      isAlreadyBookmarked: (tmdbId) =>
        Boolean(useBookmarkStore.getState().bookmarks[tmdbId]),
      addBookmark,
      onProgress: (done, total) => setProgress({ done, total }),
    });

    setSummary(summarize(results));
    setStatus("done");
  }, [rows, status, addBookmark]);

  const parsedLabel = t("settings.letterboxd.parsed").replace(
    "{n}",
    String(rows.length),
  );
  const progressLabel = t("settings.letterboxd.progress")
    .replace("{done}", String(progress.done))
    .replace("{total}", String(progress.total));
  const summaryLabel = summary
    ? t("settings.letterboxd.summary")
        .replace("{added}", String(summary.added))
        .replace("{duplicates}", String(summary.duplicates))
        .replace("{notfound}", String(summary.notfound + summary.errors))
    : "";

  return (
    <div>
      <Heading1 border>{t("settings.letterboxd.heading")}</Heading1>
      <Paragraph>{t("settings.letterboxd.description")}</Paragraph>

      <SettingsCard>
        <div className="flex flex-col space-y-4">
          <p className="text-sm text-type-secondary">
            {t("settings.letterboxd.help")}
          </p>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            ref={fileInputRef}
            className="hidden"
          />

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <Button
              theme="secondary"
              onClick={handleFileButtonClick}
              disabled={status === "importing"}
            >
              <Icon icon={Icons.FILE} className="mr-2" />
              {fileName
                ? t("settings.letterboxd.changeFile")
                : t("settings.letterboxd.selectFile")}
            </Button>

            {fileName && (
              <span className="text-sm font-medium text-white break-all">
                {fileName}
              </span>
            )}
          </div>

          {status === "error" && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <Icon icon={Icons.WARNING} className="mr-1" />
              {t("settings.letterboxd.invalid")}
            </div>
          )}

          {status === "ready" && rows.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <Icon icon={Icons.WARNING} className="mr-1" />
              {t("settings.letterboxd.empty")}
            </div>
          )}

          {rows.length > 0 && status !== "done" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-type-secondary">{parsedLabel}</p>
              <div>
                <Button
                  theme="purple"
                  onClick={handleImport}
                  disabled={status === "importing"}
                >
                  <Icon icon={Icons.BOOKMARK} className="mr-2" />
                  {status === "importing"
                    ? t("settings.letterboxd.importing")
                    : t("settings.letterboxd.import")}
                </Button>
              </div>
            </div>
          )}

          {status === "importing" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-type-secondary">{progressLabel}</p>
              <div className="w-full h-2 rounded-full bg-background overflow-hidden">
                <div
                  className="h-full bg-buttons-purple transition-[width] duration-200"
                  style={{
                    width: `${
                      progress.total > 0
                        ? Math.round((progress.done / progress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {status === "done" && summary && (
            <>
              <Divider marginClass="my-2" />
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Icon icon={Icons.CHECKMARK} className="mr-1" />
                {summaryLabel}
              </div>
            </>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
