"use client";

import { useEffect, useState } from "react";

const HIGH_CONTRAST_STORAGE_KEY = "campaign-high-contrast";

export function CampaignAccessibilityControls() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY);
    const isEnabled = storedValue === "true";
    setEnabled(isEnabled);
    document.documentElement.dataset.campaignHighContrast = String(isEnabled);
  }, []);

  const toggleHighContrast = () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    document.documentElement.dataset.campaignHighContrast = String(nextEnabled);
    window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(nextEnabled));
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
