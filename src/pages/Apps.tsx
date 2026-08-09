import { ReactNode } from "react";

import { PageTitle } from "@/pages/parts/util/PageTitle";
import { downloadWindowsApp } from "@/utils/downloadWindowsApp";

import { SubPageLayout } from "./layouts/SubPageLayout";

function WindowsGlyph(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className}
      aria-hidden
    >
      <rect x="2" y="2" width="9" height="9" rx="1.2" />
      <rect x="13" y="2" width="9" height="9" rx="1.2" />
      <rect x="2" y="13" width="9" height="9" rx="1.2" />
      <rect x="13" y="13" width="9" height="9" rx="1.2" />
    </svg>
  );
}

interface AppPanel {
  key: string;
  glyph: (className?: string) => ReactNode;
  title: string;
  tagline: string;
  bullets: string[];
  cta: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledLabel?: string;
}

function Bullet(props: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-white/60">
      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#a78bfa]" />
      <span>{props.children}</span>
    </li>
  );
}

function Panel(props: AppPanel) {
  return (
    <div className="group relative flex h-full flex-col rounded-3xl border border-white/[0.07] bg-white/[0.02] p-8 backdrop-blur-sm transition-[transform,border-color,background-color,box-shadow] duration-300 ease-out-quint hover:-translate-y-1.5 hover:border-white/[0.14] hover:bg-white/[0.04] hover:shadow-soft-lg">
      <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[radial-gradient(120%_100%_at_50%_0%,rgba(130,136,254,0.10),transparent_60%)] opacity-0 transition-opacity duration-500 ease-out-quint group-hover:opacity-100" />

      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5a62eb] to-[#292d86] text-white shadow-soft-md transition-transform duration-300 ease-spring group-hover:scale-105 group-hover:-rotate-3">
        {props.glyph("h-7 w-7")}
      </div>

      <h3 className="relative mt-6 text-xl font-bold text-white">
        {props.title}
      </h3>
      <p className="relative mt-2 text-sm leading-relaxed text-white/50">
        {props.tagline}
      </p>

      <ul className="relative mt-6 flex flex-col gap-2.5">
        {props.bullets.map((b) => (
          <Bullet key={b}>{b}</Bullet>
        ))}
      </ul>

      <div className="relative mt-8 flex-1" />

      {props.disabled ? (
        <span className="relative flex items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] px-5 py-3 text-sm font-semibold text-white/35">
          {props.disabledLabel ?? "coming soon"}
        </span>
      ) : (
        <button
          type="button"
          onClick={props.onClick}
          className="relative flex items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-3 text-sm font-bold text-white transition-transform duration-300 ease-spring hover:scale-[1.03] active:scale-[0.97]"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-[#8288fe] to-[#5a62eb] transition-transform duration-500 ease-out-quint group-hover:scale-105" />
          <span className="relative">{props.cta}</span>
        </button>
      )}
    </div>
  );
}

export function AppsPage() {
  const windowsPanel: AppPanel = {
    key: "windows",
    glyph: (c) => <WindowsGlyph className={c} />,
    title: "Windows",
    tagline: "the native desktop app, built for comfort.",
    bullets: [
      "native player, better sources, extra features",
      "auto-updates built right in",
      "system tray and close-to-tray",
    ],
    cta: "download for Windows",
    onClick: () => downloadWindowsApp(),
  };

  return (
    <SubPageLayout>
      <PageTitle k="global.pages.apps" subpage />

      <div className="mx-auto max-w-5xl px-6 pb-32 pt-4 sm:px-8">
        <div className="text-center">
          <h1 className="mx-auto max-w-2xl text-4xl font-black leading-[1.1] text-white sm:text-5xl">
            kstream, on{" "}
            <span className="bg-gradient-to-r from-[#aaafff] via-[#c084fc] to-[#8288fe] bg-clip-text text-transparent">
              your desktop
            </span>
            .
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/50">
            install the Windows app for native scraping, auto-updates, and a
            tray-friendly experience.
          </p>
        </div>

        <div className="relative mx-auto mt-16 max-w-md">
          <Panel {...windowsPanel} />
        </div>
      </div>
    </SubPageLayout>
  );
}
