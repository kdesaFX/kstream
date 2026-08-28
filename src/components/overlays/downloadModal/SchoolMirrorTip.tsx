import { useEffect, useState } from "react";
import { useCopyToClipboard } from "react-use";

import { Icon, Icons } from "@/components/Icon";
import {
  SCHOOL_MIRROR_LABEL,
  SCHOOL_MIRROR_URL,
} from "@/setup/constants";

/**
 * Tip for filtered networks: main domain may be blocked; mirror is same Worker.
 */
export function SchoolMirrorTip(props: { className?: string }) {
  const [, copyToClipboard] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = () => {
    copyToClipboard(SCHOOL_MIRROR_URL);
    setCopied(true);
  };

  return (
    <div
      className={
        props.className ??
        "rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3"
      }
    >
      <p className="text-sm leading-relaxed text-amber-100/90">
        School or work filters (GoGuardian, etc.) often block{" "}
        <span className="font-semibold text-amber-50">kdesa.stream</span>. Use
        the {SCHOOL_MIRROR_LABEL.toLowerCase()} mirror instead — same app, same
        proxies:
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={SCHOOL_MIRROR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate rounded-lg border border-amber-400/25 bg-black/20 px-3 py-1.5 text-xs font-medium text-amber-50 underline-offset-2 hover:underline sm:text-sm"
        >
          {SCHOOL_MIRROR_URL.replace(/^https:\/\//, "")}
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/15 px-2.5 py-1.5 text-xs font-semibold text-amber-50 transition-colors hover:bg-amber-400/25"
        >
          <Icon icon={Icons.COPY} className="text-sm" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-amber-100/70">
        Some networks may also block workers.dev or individual stream hosts.
        Download the Windows installer on home Wi‑Fi if the site itself is
        unreachable.
      </p>
    </div>
  );
}
