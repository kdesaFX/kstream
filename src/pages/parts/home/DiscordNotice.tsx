import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon, Icons } from "@/components/Icon";
import { conf } from "@/setup/config";

const STORAGE_KEY = "zstream::discord-notice-dismissed";

export function DiscordNotice() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;
    const showTimer = setTimeout(() => {
      setVisible(true);
      requestAnimationFrame(() => setEntered(true));
    }, 900);
    return () => clearTimeout(showTimer);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setEntered(false);
    setTimeout(() => setVisible(false), 250);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(1.25rem,env(safe-area-inset-top))] z-[200] flex justify-center px-4">
      <div
        className={[
          "pointer-events-auto group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/10",
          "bg-[#12141c]/85 px-4 py-3 pr-2 shadow-soft-lg backdrop-blur-xl ring-1 ring-white/5",
          "transition-[transform,opacity] duration-300 ease-out-quint",
          "max-w-[min(30rem,calc(100vw-2rem))]",
          entered ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0",
        ].join(" ")}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(88,101,242,0.18),transparent_70%)]" />

        <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#5865F2] to-[#4752c4] text-white shadow-soft-sm">
          <span className="absolute inset-0 rounded-xl bg-[#5865F2]/40 animate-ping" />
          <Icon icon={Icons.DISCORD} className="relative text-lg" />
        </div>

        <div className="relative min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-white">
            {t("discordNotice.title")}
          </p>
          <p className="text-xs leading-snug text-white/60">
            {t("discordNotice.description")}
          </p>
        </div>

        <a
          href={conf().DISCORD_LINK}
          target="_blank"
          rel="noreferrer"
          onClick={dismiss}
          className="relative flex-shrink-0 rounded-lg bg-[#5865F2] px-3 py-1.5 text-xs font-bold text-white transition-[background-color,transform] duration-150 ease-spring hover:-translate-y-0.5 hover:bg-[#4a56e0] active:translate-y-0"
        >
          {t("discordNotice.join")}
        </a>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("discordNotice.dismiss")}
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors duration-150 hover:bg-white/5 hover:text-white/80"
        >
          <Icon icon={Icons.X} className="text-base" />
        </button>
      </div>
    </div>
  );
}
