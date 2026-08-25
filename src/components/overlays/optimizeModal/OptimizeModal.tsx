import classNames from "classnames";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { syncDeviceProfileSettings } from "@/backend/accounts/settings";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { FancyModal } from "@/components/overlays/Modal";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useAuthStore } from "@/stores/auth";
import { usePreferencesStore } from "@/stores/preferences";
import {
  DEVICE_PROFILE_APPLY_STEPS,
  deviceProfileSummaryKeys,
  inferDeviceProfile,
  recommendDeviceProfile,
  type DeviceProfile,
} from "@/stores/preferences/deviceProfile";

import { useOptimizeModal } from "./useOptimizeModal";

const PROFILES: DeviceProfile[] = ["low", "mid", "high"];

const STEP_KEYS = {
  posters: "settings.optimize.stepPosters",
  proxy: "settings.optimize.stepProxy",
  effects: "settings.optimize.stepEffects",
  lazy: "settings.optimize.stepLazy",
  restorePosters: "settings.optimize.stepRestorePosters",
  restoreEffects: "settings.optimize.stepRestoreEffects",
  save: "settings.optimize.stepSave",
} as const;

function profileLabel(profile: DeviceProfile) {
  return `settings.optimize.${profile}Title`;
}

export function OptimizeEffectsSync() {
  const lowPerf = usePreferencesStore((s) => s.enableLowPerformanceMode);
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-visual-effects", lowPerf);
  }, [lowPerf]);
  return null;
}

export function DeviceProfileCards({
  selected,
  onSelect,
  disabled,
  recommended,
}: {
  selected?: DeviceProfile | "custom" | null;
  onSelect: (profile: DeviceProfile) => void;
  disabled?: boolean;
  recommended?: DeviceProfile | null;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {PROFILES.map((profile) => {
        const active = selected === profile;
        const isRecommended = recommended === profile;
        return (
          <button
            key={profile}
            type="button"
            disabled={disabled || active}
            aria-pressed={active}
            onClick={() => {
              if (active) return;
              onSelect(profile);
            }}
            className={classNames(
              "rounded-2xl border p-4 text-left transition-colors",
              active
                ? "cursor-default border-type-link bg-type-link/15"
                : isRecommended
                  ? "border-type-link/60 bg-type-link/10 hover:border-type-link hover:bg-type-link/15"
                  : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10",
              disabled && !active && "cursor-wait opacity-70",
              active && "opacity-100",
            )}
          >
            {active ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-type-link">
                {t("settings.optimize.current") ?? "Currently selected"}
              </p>
            ) : isRecommended ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-type-link">
                {t("settings.optimize.recommended")}
              </p>
            ) : null}
            <p className="font-bold text-white">{t(profileLabel(profile))}</p>
            <p className="mt-2 text-sm leading-snug text-type-secondary">
              {t(`settings.optimize.${profile}Desc`)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

export function OptimizeModal() {
  const { t } = useTranslation();
  const { modalId, closeOptimizeModal } = useOptimizeModal();
  const lastApplied = usePreferencesStore((s) => s.lastAppliedDeviceProfile);
  const snapshot = usePreferencesStore((s) => s.deviceProfileSnapshot);
  const applyDeviceProfile = usePreferencesStore((s) => s.applyDeviceProfile);
  const resetDeviceProfile = usePreferencesStore((s) => s.resetDeviceProfile);
  const inferred = usePreferencesStore((s) => inferDeviceProfile(s));
  const backendUrl = useBackendUrl();
  const account = useAuthStore((s) => s.account);

  const recommended = useMemo(() => recommendDeviceProfile(), []);

  const currentProfile =
    inferred === "custom" ? lastApplied : inferred;

  const [phase, setPhase] = useState<"pick" | "applying" | "done">("pick");
  const [activeProfile, setActiveProfile] = useState<DeviceProfile | null>(
    null,
  );
  const [stepIndex, setStepIndex] = useState(0);

  const steps = activeProfile
    ? DEVICE_PROFILE_APPLY_STEPS[activeProfile]
    : [];

  const runApply = (profile: DeviceProfile) => {
    if (currentProfile === profile) return;
    applyDeviceProfile(profile);
    void syncDeviceProfileSettings(backendUrl, account);
    setActiveProfile(profile);
    setPhase("applying");
    setStepIndex(0);
    const list = DEVICE_PROFILE_APPLY_STEPS[profile];
    let i = 0;
    const tick = () => {
      if (i >= list.length - 1) {
        setStepIndex(list.length - 1);
        window.setTimeout(() => setPhase("done"), 420);
        return;
      }
      i += 1;
      setStepIndex(i);
      window.setTimeout(tick, 520);
    };
    window.setTimeout(tick, 520);
  };

  const handleReset = () => {
    resetDeviceProfile();
    void syncDeviceProfileSettings(backendUrl, account);
    setPhase("pick");
    setActiveProfile(null);
    setStepIndex(0);
  };

  const handleClose = () => {
    if (phase === "applying") return;
    setPhase("pick");
    setActiveProfile(null);
    setStepIndex(0);
    closeOptimizeModal();
  };

  const currentStepKey = steps[stepIndex]
    ? STEP_KEYS[steps[stepIndex]]
    : STEP_KEYS.save;
  const progress =
    steps.length > 0 ? ((stepIndex + 1) / steps.length) * 100 : 0;
  const showReset = Boolean(snapshot) || Boolean(lastApplied);
  const summaryKeys = activeProfile
    ? deviceProfileSummaryKeys(activeProfile)
    : [];

  return (
    <FancyModal
      id={modalId}
      title={t("settings.optimize.title")}
      size="lg"
    >
      {phase === "pick" ? (
        <div className="space-y-5 text-base">
          <p>{t("settings.optimize.subtitle")}</p>
          <DeviceProfileCards
            selected={currentProfile}
            recommended={recommended}
            onSelect={runApply}
          />
          {currentProfile !== recommended ? (
            <Button theme="purple" onClick={() => runApply(recommended)}>
              {t("settings.optimize.useRecommended")}
            </Button>
          ) : (
            <p className="text-sm text-type-secondary">
              {t("settings.optimize.alreadyOnRecommended") ??
                "You're already on the recommended build for this device."}
            </p>
          )}
          {showReset ? (
            <p className="text-sm text-type-secondary">
              {t("settings.optimize.resetHint")}{" "}
              <button
                type="button"
                onClick={handleReset}
                className="underline decoration-white/20 underline-offset-4 hover:text-white"
              >
                {t("settings.optimize.reset")}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === "applying" && activeProfile ? (
        <div className="space-y-5 py-4">
          <p className="text-white">
            {t("settings.optimize.applying", {
              profile: t(profileLabel(activeProfile)),
            })}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-type-link transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-white">
            <Icon icon={Icons.TACHOMETER} className="text-xl" />
            <span>{t(currentStepKey)}</span>
          </div>
        </div>
      ) : null}

      {phase === "done" && activeProfile ? (
        <div className="space-y-5">
          <p className="text-white text-lg font-semibold">
            {t("settings.optimize.doneTitle", {
              profile: t(profileLabel(activeProfile)),
            })}
          </p>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-sm font-medium text-type-secondary">
              {t("settings.optimize.doneSummary")}
            </p>
            <p className="mt-1 text-white">
              {summaryKeys.map((key) => t(key)).join(" · ")}
            </p>
          </div>
          <p>{t("settings.optimize.doneBody")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button theme="purple" onClick={handleClose}>
              {t("settings.optimize.close")}
            </Button>
            {showReset ? (
              <button
                type="button"
                onClick={handleReset}
                className="text-sm text-type-secondary underline decoration-white/20 underline-offset-4 hover:text-white"
              >
                {t("settings.optimize.reset")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </FancyModal>
  );
}
