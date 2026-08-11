import { useCallback, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { usePlayerStore } from "@/stores/player/store";

/**
 * Always leaves the player for home on the first click.
 * Soft history "last non-player" links + hover-gated chrome caused missed
 * clicks and multi-tap exits while streams were still loading.
 */
export function BackLink(_props: { url?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const goHome = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      // Middle/modified clicks keep normal browser behavior (new tab).
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      try {
        usePlayerStore.getState().reset();
      } catch {
        // still leave even if teardown throws
      }

      navigate("/", { replace: true });
    },
    [navigate],
  );

  return (
    <div className="flex items-center shrink-0 relative z-[60]">
      <a
        href="/"
        onClick={goHome}
        onPointerDown={(e) => e.stopPropagation()}
        className="py-1 -my-1 px-2 -mx-2 tabbable rounded-lg flex items-center whitespace-nowrap cursor-pointer text-type-secondary hover:text-white transition-colors duration-200 font-medium"
      >
        <Icon className="mr-2 shrink-0" icon={Icons.ARROW_LEFT} />
        <span className="md:hidden">{t("player.back.short")}</span>
        <span className="hidden md:block">{t("player.back.default")}</span>
      </a>
    </div>
  );
}
