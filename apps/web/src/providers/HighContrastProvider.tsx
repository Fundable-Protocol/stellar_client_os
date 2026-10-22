"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { safeGetItem, safeSetItem } from "@/utils/safe-storage";

export interface HighContrastContextValue {
  isHighContrast: boolean;
  toggleHighContrast: () => void;
  setHighContrast: (enabled: boolean) => void;
}

export const HIGH_CONTRAST_STORAGE_KEY = "fundable-high-contrast";
export const CAMPAIGN_HIGH_CONTRAST_KEY = "campaign-high-contrast";
export const HIGH_CONTRAST_EVENT = "fundable-high-contrast-change";

const HighContrastContext = createContext<HighContrastContextValue>({
  isHighContrast: false,
  toggleHighContrast: () => {},
  setHighContrast: () => {},
});

export function HighContrastProvider({ children }: { children: ReactNode }) {
  const [isHighContrast, setIsHighContrast] = useState(false);

  const applyHighContrast = useCallback((enabled: boolean) => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("high-contrast", enabled);
      document.documentElement.dataset.campaignHighContrast = String(enabled);
      document.documentElement.dataset.highContrast = String(enabled);
    }
  }, []);

  useEffect(() => {
    try {
      const stored =
        safeGetItem(HIGH_CONTRAST_STORAGE_KEY) ??
        safeGetItem(CAMPAIGN_HIGH_CONTRAST_KEY);
      const isEnabled = stored === "true";
      setIsHighContrast(isEnabled);
      applyHighContrast(isEnabled);
    } catch {
      // fallback if storage access fails
    }

    const handleStorageChange = () => {
      const stored =
        safeGetItem(HIGH_CONTRAST_STORAGE_KEY) ??
        safeGetItem(CAMPAIGN_HIGH_CONTRAST_KEY);
      const isEnabled = stored === "true";
      setIsHighContrast(isEnabled);
      applyHighContrast(isEnabled);
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(HIGH_CONTRAST_EVENT, handleStorageChange);
    window.addEventListener("campaign-high-contrast-change", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(HIGH_CONTRAST_EVENT, handleStorageChange);
      window.removeEventListener("campaign-high-contrast-change", handleStorageChange);
    };
  }, [applyHighContrast]);

  const setHighContrast = useCallback(
    (enabled: boolean) => {
      setIsHighContrast(enabled);
      applyHighContrast(enabled);
      safeSetItem(HIGH_CONTRAST_STORAGE_KEY, String(enabled));
      safeSetItem(CAMPAIGN_HIGH_CONTRAST_KEY, String(enabled));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(HIGH_CONTRAST_EVENT));
        window.dispatchEvent(new Event("campaign-high-contrast-change"));
      }
    },
    [applyHighContrast]
  );

  const toggleHighContrast = useCallback(() => {
    setHighContrast(!isHighContrast);
  }, [isHighContrast, setHighContrast]);

  return (
    <HighContrastContext.Provider
      value={{
        isHighContrast,
        toggleHighContrast,
        setHighContrast,
      }}
    >
      {children}
    </HighContrastContext.Provider>
  );
}

export function useHighContrast() {
  const context = useContext(HighContrastContext);
  if (!context) {
    return {
      isHighContrast: false,
      toggleHighContrast: () => {},
      setHighContrast: () => {},
    };
  }
  return context;
}
