"use client";

import { useReferralUrl } from "@/hooks/use-referrals";
import { useWallet } from "@/providers/StellarWalletProvider";
import { Button } from "@/components/ui/button";
import { Copy, Check, Link as LinkIcon } from "lucide-react";
import { useState, useCallback } from "react";

/**
 * Displays the user's referral link with a copy-to-clipboard button.
 */
export default function ReferralLink() {
  const { address } = useWallet();
  const { referralUrl } = useReferralUrl();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
      const el = document.getElementById("referral-link-input");
      if (el instanceof HTMLInputElement) {
        el.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [referralUrl]);

  if (!address) {
    return null;
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-3">
        <LinkIcon className="w-5 h-5 text-fundable-purple-2" />
        <h3 className="text-lg font-semibold text-white">Your Referral Link</h3>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Share this link with friends. When they register as a planter and complete
        their first job, you earn <span className="text-white font-medium">2 XLM</span>.
      </p>
      <div className="flex items-center gap-2">
        <input
          id="referral-link-input"
          readOnly
          value={referralUrl}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-300 font-mono truncate"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="shrink-0 border-zinc-700 hover:bg-zinc-800"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-400 mr-1.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-1.5" />
              Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
