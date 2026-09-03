import classNames from "classnames";
import { ReactNode } from "react";

import { Icon, Icons } from "@/components/Icon";

export function PlayerStageBackdrop({
  poster,
}: {
  poster?: string | null;
}) {
  return (
    <>
      {poster ? (
        <img
          src={poster}
          alt=""
          // no-fade: stage remounts on scrape hops; global img fade would pulse.
          className="no-fade absolute inset-0 h-full w-full scale-105 object-cover opacity-30 blur-md"
          aria-hidden
        />
      ) : null}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-black/90"
        aria-hidden
      />
    </>
  );
}

export function PlayerStageOverlay({
  poster,
  className,
  children,
}: {
  poster?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={classNames(
        "absolute inset-0 z-0 flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      <PlayerStageBackdrop poster={poster} />
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center px-8 text-center">
        {children}
      </div>
    </div>
  );
}

export function PlayerStageIcon({
  icon = Icons.CLAPPER_BOARD,
}: {
  icon?: Icons;
}) {
  return (
    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
      <Icon icon={icon} className="text-5xl text-white" />
    </div>
  );
}

export function PlayerStageMessage({
  poster,
  mediaTitle,
  badge,
  badgeIcon = Icons.WAND,
  heading,
  body,
  className,
  children,
}: {
  poster?: string | null;
  mediaTitle?: string;
  badge?: string;
  badgeIcon?: Icons;
  heading: string;
  body?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <PlayerStageOverlay poster={poster} className={className}>
      <PlayerStageIcon icon={badgeIcon} />
      {badge ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-type-link">
          {badge}
        </p>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        {heading}
      </h2>
      {mediaTitle ? (
        <p className="mt-3 line-clamp-2 text-sm text-white/50">{mediaTitle}</p>
      ) : null}
      {body ? (
        <div className="mt-4 text-sm leading-relaxed text-white/60">{body}</div>
      ) : null}
      {children ? (
        <div className="mt-8 flex w-full max-w-sm flex-col items-center gap-3">
          {children}
        </div>
      ) : null}
    </PlayerStageOverlay>
  );
}
