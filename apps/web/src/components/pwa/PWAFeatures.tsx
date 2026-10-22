"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

const DISMISS_KEY = "fundable-pwa-install-dismissed";

export function PWAFeatures() {
  const [isOnline, setIsOnline] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const ios = /iPad|iPhone|iPod/i.test(userAgent) || touchMac;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

    setIsOnline(navigator.onLine);
    setIsIOS(ios);
    setIsMobile(
      /Android|iPad|iPhone|iPod/i.test(userAgent) ||
        touchMac ||
        window.matchMedia("(pointer: coarse)").matches,
    );
    setIsStandalone(standalone);

    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }

    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
      setDismissed(true);
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // The site remains usable if service workers are blocked or unsupported.
      });
    }

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const dismissInstall = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Dismissal is only a convenience if storage is disabled.
    }
  };

  const installApp = async () => {
    if (!installPrompt) {
      setShowInstallHelp((visible) => !visible);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") dismissInstall();
    } catch {
      setShowInstallHelp(true);
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <>
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 top-3 z-[60] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-zinc-950/95 px-4 py-3 text-sm text-white shadow-xl"
        >
          <span>
            <strong className="mr-1 text-amber-300">You're offline.</strong>
            Saved campaign summaries may be available on this device.
          </span>
          <a className="font-semibold text-violet-300 underline underline-offset-4" href="/offline.html">
            Saved campaigns
          </a>
        </div>
      )}

      {isMobile && !isStandalone && !dismissed && (
        <aside
          aria-label="Install Fundable"
          className="fixed bottom-20 right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-violet-400/30 bg-zinc-950/95 p-4 text-white shadow-2xl backdrop-blur"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="font-semibold">Add Fundable to your home screen</p>
              <p className="mt-1 text-sm leading-5 text-zinc-300">
                Open campaigns faster and keep viewed campaign summaries available offline.
              </p>
            </div>
            <button
              type="button"
              aria-label="Dismiss install prompt"
              onClick={dismissInstall}
              className="rounded-md px-2 py-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={installApp}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold hover:bg-violet-500"
            >
              {installPrompt ? "Install app" : "How to install"}
            </button>
            {showInstallHelp && (
              <p className="basis-full text-sm leading-5 text-zinc-300">
                {isIOS
                  ? "In Safari, tap Share, then choose Add to Home Screen."
                  : "Open your browser menu and choose Install app or Add to Home screen."}
              </p>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
