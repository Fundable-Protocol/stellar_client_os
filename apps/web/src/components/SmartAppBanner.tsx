"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  detectMobilePlatform,
  getDeepLinkConfig,
  toAppUrl,
  type MobilePlatform,
} from "@/lib/deep-links";

const DISMISS_KEY = "smart-app-banner-dismissed";

/**
 * Smart banner shown on mobile web. When the app is installed, universal/app
 * links open it directly before this page loads; users who still land here
 * get an "Open" action (custom scheme) and a store install link.
 */
export function SmartAppBanner() {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<MobilePlatform>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setPlatform(detectMobilePlatform(navigator.userAgent));
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!platform || dismissed) return null;

  const config = getDeepLinkConfig();
  const storeUrl =
    platform === "ios" ? config.iosStoreUrl : config.androidStoreUrl;
  const appUrl = toAppUrl(
    pathname ?? "/",
    typeof window === "undefined" ? "" : window.location.search,
    config.appScheme,
  );
  if (!storeUrl && !appUrl) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div
      role="region"
      aria-label="Get the mobile app"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center gap-3 border-t bg-white p-3 text-sm text-black shadow-lg dark:bg-neutral-900 dark:text-white"
    >
      <button type="button" onClick={dismiss} aria-label="Dismiss app banner">
        ✕
      </button>
      <span className="flex-1">Get the best experience in the Fundable app.</span>
      {appUrl && (
        <a href={appUrl} className="font-semibold underline">
          Open
        </a>
      )}
      {storeUrl && (
        <a href={storeUrl} className="font-semibold underline">
          Install
        </a>
      )}
    </div>
  );
}
