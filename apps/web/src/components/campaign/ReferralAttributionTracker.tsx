"use client";

import { useEffect } from "react";

/** Keep the referral code from a short-link landing page until pledge submission. */
export function ReferralAttributionTracker() {
  useEffect(() => {
    const capture = () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("ref");
        const campaignMatch = url.pathname.match(/^\/campaigns\/([^/]+)/);
        if (!code || !campaignMatch || !/^[A-Za-z0-9_-]{8,16}$/.test(code)) return;
        const campaignId = decodeURIComponent(campaignMatch[1]);
        window.sessionStorage.setItem(`fundable:referral:${campaignId}`, code);
      } catch {
        // Attribution is optional; blocked storage must never block campaign browsing.
      }
    };
    capture();
    window.addEventListener("pageshow", capture);
    return () => window.removeEventListener("pageshow", capture);
  }, []);

  return null;
}
