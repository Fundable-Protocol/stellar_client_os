"use client";

import { useEffect, useSyncExternalStore } from "react";
import { safeGetItem, safeSetItem } from "@/utils/safe-storage";

const HIGH_CONTRAST_STORAGE_KEY = "campaign-high-contrast";
const HIGH_CONTRAST_CHANGE_EVENT = "campaign-high-contrast-change";
let inMemoryPreference: boolean | null = null;

function subscribeToHighContrast(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(HIGH_CONTRAST_CHANGE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(HIGH_CONTRAST_CHANGE_EVENT, onChange);
  };
}

function getHighContrastSnapshot() {
  const storedValue = safeGetItem(HIGH_CONTRAST_STORAGE_KEY);
  return storedValue === null
    ? (inMemoryPreference ?? false)
    : storedValue === "true";
}

export function CampaignAccessibilityControls() {
  const enabled = useSyncExternalStore(
    subscribeToHighContrast,
    getHighContrastSnapshot,
    () => false,
  );

  useEffect(() => {
    document.documentElement.dataset.campaignHighContrast = String(enabled);
  }, [enabled]);

  const toggleHighContrast = () => {
    const nextEnabled = !enabled;
    inMemoryPreference = safeSetItem(
      HIGH_CONTRAST_STORAGE_KEY,
      String(nextEnabled),
    )
      ? null
      : nextEnabled;
    window.dispatchEvent(new Event(HIGH_CONTRAST_CHANGE_EVENT));
  };

  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={toggleHighContrast}
      className="rounded-lg border border-zinc-500 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
    >
      High contrast: {enabled ? "On" : "Off"}
    </button>
  );
}
