"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Heart, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DonationToken } from "@/types/campaign-donation";
import { CampaignDonationPanel } from "./CampaignDonationPanel";

export interface OneTimeDonationButtonProps {
  campaignId: string;
  campaignName?: string;
  defaultToken?: DonationToken;
  className?: string;
}

/**
 * "One-time Donate" action for the campaign page (issue #865).
 *
 * Opens a modal containing the existing CampaignDonationPanel so supporters can
 * make a one-time charitable contribution without buying specific trees. The
 * panel owns validation, wallet connection, the API call and the receipt.
 */
export function OneTimeDonationButton({
  campaignId,
  campaignName,
  defaultToken,
  className,
}: OneTimeDonationButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="sm"
        variant="outline"
        aria-haspopup="dialog"
        data-testid="one-time-donate-trigger"
        onClick={() => setOpen(true)}
        className={cn(
          "border-rose-600/40 text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 text-xs",
          className,
        )}
      >
        <Heart className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
        One-time Donate
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          {/* Always dark: CampaignDonationPanel is styled for a dark surface. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-4 text-zinc-100 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id={titleId} className="text-sm font-medium text-zinc-400">
                One-time donation
              </h2>
              <Button
                ref={closeRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close donation dialog"
                onClick={close}
                className="text-zinc-400 hover:text-zinc-100"
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            <CampaignDonationPanel
              campaignId={campaignId}
              campaignName={campaignName}
              defaultToken={defaultToken}
            />
            <p className="mt-3 text-center text-xs text-zinc-500">
              Prefer a full page?{" "}
              <Link
                href={`/campaigns/${campaignId}/donate`}
                className="text-zinc-300 underline underline-offset-2 hover:text-zinc-100"
              >
                Open the donation page
              </Link>
            </p>
          </div>
        </div>
      )}
    </>
  );
}