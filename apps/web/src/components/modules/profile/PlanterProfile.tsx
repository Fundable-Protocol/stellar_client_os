"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Gift,
  QrCode,
  Share2,
  Sparkles,
  TreePine,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import QRCode from "qrcode";
import { useWallet } from "@/providers/StellarWalletProvider";
import { ConnectWalletPrompt } from "@/components/layouts/ProtectedRoute";
import {
  getPlanterReferralStats,
  getPlanterReferralUrl,
  REFERRAL_BONUS_XLM,
  type PlanterReferralStats,
} from "@/services/social.service";

export interface PlanterProfileProps {
  initialAddress?: string;
}

export const PlanterProfile: React.FC<PlanterProfileProps> = ({ initialAddress }) => {
  const { address: walletAddress } = useWallet();
  const address = initialAddress || walletAddress;

  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [stats, setStats] = useState<PlanterReferralStats>(() =>
    getPlanterReferralStats(address || "")
  );

  const referralUrl = useMemo(() => {
    return address ? getPlanterReferralUrl(address) : "";
  }, [address]);

  useEffect(() => {
    if (address) {
      setStats(getPlanterReferralStats(address));
    }
  }, [address]);

  useEffect(() => {
    if (!referralUrl) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(referralUrl, {
      width: 240,
      margin: 2,
      color: {
        dark: "#047857", // emerald-700
        light: "#ffffff",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error("Error generating QR code:", err));
  }, [referralUrl]);

  const handleCopy = async () => {
    if (!referralUrl) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(referralUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy referral link:", err);
    }
  };

  const handleShare = async () => {
    if (!referralUrl) return;
    const shareText = `Support verified tree planting with me on Fundable! Sponsor a tree via my referral link and empower global reforestation on Stellar:`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Fundable Tree Planting Referral",
          text: shareText,
          url: referralUrl,
        });
        return;
      } catch {
        // User dismissed share dialog, fallback to twitter/x
      }
    }
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      shareText
    )}&url=${encodeURIComponent(referralUrl)}`;
    window.open(twitterUrl, "_blank", "noopener,noreferrer");
  };

  if (!address) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <ConnectWalletPrompt
          title="Connect Planter Wallet"
          description="Please connect your Stellar wallet to view your planter profile, manage your unique referral link, and track your 5 XLM commission bonuses."
          containerClassName="min-h-[450px]"
        />
      </div>
    );
  }

  const maskedAddress = `${address.slice(0, 6)}...${address.slice(-6)}`;
  const progressPercent = Math.min(100, Math.round((stats.monthlyCount / stats.monthlyCap) * 100));

  return (
    <div className="max-w-6xl mx-auto space-y-8 text-white">
      {/* ── Planter Header Card ────────────────────────────────────────── */}
      <section
        data-testid="planter-profile-header"
        className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-zinc-900/90 to-zinc-950 p-6 md:p-8 backdrop-blur-xl shadow-2xl"
      >
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="size-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-900/30 flex-shrink-0">
              <div className="size-full bg-zinc-950 rounded-[14px] flex items-center justify-center text-emerald-400">
                <TreePine className="size-8" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                  Planter Profile
                </h1>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="size-3" />
                  Verified Planter
                </span>
              </div>
              <p className="text-zinc-400 text-sm max-w-xl">
                Share your unique referral link to onboard new sponsors. Earn an instant{" "}
                <span className="font-semibold text-emerald-300">{REFERRAL_BONUS_XLM} XLM bonus</span>{" "}
                for every sponsor who completes their first tree sponsorship.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 rounded-2xl px-4 py-3 self-start md:self-auto">
            <Wallet className="size-5 text-emerald-400" />
            <div>
              <p className="text-xs text-zinc-400 font-medium">Connected Planter Account</p>
              <p className="font-mono text-sm text-zinc-200" title={address}>
                {maskedAddress}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Unique Referral Link Card ───────────────────────────────────── */}
      <section
        data-testid="referral-link-section"
        className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 md:p-8 backdrop-blur-md space-y-6 shadow-xl"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1">
              <Gift className="size-4" />
              <span>Earn {REFERRAL_BONUS_XLM} XLM Per Referral</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white">
              Your Unique Referral Link
            </h2>
            <p className="text-sm text-zinc-400">
              When a new sponsor visits Fundable using this link and sponsors a tree, you earn a{" "}
              {REFERRAL_BONUS_XLM} XLM commission bonus.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowQr((prev) => !prev)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 text-sm font-medium transition-all"
              aria-label="Toggle QR code display"
              data-testid="qr-toggle-btn"
            >
              <QrCode className="size-4 text-emerald-400" />
              <span>{showQr ? "Hide QR" : "Show QR"}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 text-sm font-medium transition-all"
              aria-label="Share referral link"
              data-testid="share-link-btn"
            >
              <Share2 className="size-4 text-emerald-400" />
              <span>Share</span>
            </button>
          </div>
        </div>

        {/* Input & Copy Row */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full">
            <input
              type="text"
              readOnly
              value={referralUrl}
              data-testid="referral-url-input"
              aria-label="Referral link"
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-4 py-3.5 text-sm font-mono text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-inner"
            />
          </div>
          <button
            type="button"
            onClick={handleCopy}
            data-testid="copy-referral-btn"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-zinc-950 font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex-shrink-0"
          >
            {copied ? (
              <>
                <Check className="size-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-4" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        </div>

        {/* QR Code Modal / Drawer */}
        {showQr && qrDataUrl && (
          <div
            data-testid="qr-code-container"
            className="mt-4 flex flex-col items-center justify-center p-6 rounded-2xl bg-zinc-950 border border-zinc-800 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200"
          >
            <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
              Scan to open your referral link
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Planter Referral QR Code"
              className="size-52 rounded-xl shadow-lg border border-white/10"
              data-testid="referral-qr-image"
            />
            <p className="text-xs text-zinc-500 font-mono break-all max-w-sm">{referralUrl}</p>
          </div>
        )}

        {/* Commission Mechanism Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 space-y-2">
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-sm flex items-center justify-center border border-emerald-500/20">
              1
            </div>
            <h3 className="text-sm font-semibold text-white">Share Referral Link</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Send your personal URL to prospective sponsors, carbon buyers, or eco-partners.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 space-y-2">
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-sm flex items-center justify-center border border-emerald-500/20">
              2
            </div>
            <h3 className="text-sm font-semibold text-white">Sponsor Funds Tree</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              New sponsor connects their Stellar wallet and funds their first verified tree planting.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 space-y-2">
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-sm flex items-center justify-center border border-emerald-500/20">
              3
            </div>
            <h3 className="text-sm font-semibold text-white">Earn {REFERRAL_BONUS_XLM} XLM Bonus</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              A 5 XLM commission is automatically credited to your planter referral rewards.
            </p>
          </div>
        </div>
      </section>

      {/* ── Stats & Referral Performance ──────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-400">Total Bonus Earned</p>
            <div className="size-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Sparkles className="size-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white" data-testid="total-bonus-xlm">
            {stats.totalBonusXlm.toFixed(2)}{" "}
            <span className="text-lg font-normal text-emerald-400">XLM</span>
          </p>
          <p className="text-xs text-zinc-500">
            {stats.totalRewardsStroops} stroops credited
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md space-y-2 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-400">Sponsors Referred</p>
            <div className="size-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <Users className="size-5" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white" data-testid="total-referrals-count">
            {stats.totalReferrals}
          </p>
          <p className="text-xs text-zinc-500">Unique sponsors onboarded</p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-400">Monthly Quota</p>
            <div className="size-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <TrendingUp className="size-5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-extrabold text-white" data-testid="monthly-quota-count">
              {stats.monthlyCount}{" "}
              <span className="text-sm font-normal text-zinc-400">/ {stats.monthlyCap}</span>
            </p>
            <span className="text-xs font-semibold text-emerald-400">{progressPercent}%</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* ── Referral Rewards History Table ────────────────────────────── */}
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 md:p-8 backdrop-blur-md space-y-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Referral Rewards History</h2>
            <p className="text-sm text-zinc-400">
              Record of completed sponsor referrals and 5 XLM commission bonuses.
            </p>
          </div>
          {stats.rewards.length > 0 && (
            <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              {stats.rewards.length} Completed
            </span>
          )}
        </div>

        {stats.rewards.length === 0 ? (
          <div
            data-testid="referral-history-empty"
            className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl bg-zinc-950/40 border border-zinc-800 text-center space-y-3"
          >
            <div className="size-12 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500">
              <Gift className="size-6" />
            </div>
            <h3 className="text-base font-semibold text-white">No referral rewards yet</h3>
            <p className="text-sm text-zinc-400 max-w-md">
              Share your referral link with sponsors. Once a referred sponsor completes their first
              tree planting, your 5 XLM bonus will appear here!
            </p>
            <button
              type="button"
              onClick={handleCopy}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition-colors"
            >
              <Copy className="size-3.5 text-emerald-400" />
              <span>Copy Referral Link</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300" data-testid="referral-history-table">
              <thead className="border-b border-zinc-800 text-xs font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-950/30">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Referred Sponsor
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Bonus Earned
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {stats.rewards.map((reward, idx) => {
                  const sponsorMasked = `${reward.referredSponsor.slice(0, 6)}...${reward.referredSponsor.slice(-4)}`;
                  const dateFormatted = new Date(reward.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3.5 font-mono text-zinc-200">
                        {sponsorMasked}
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400">{dateFormatted}</td>
                      <td className="px-4 py-3.5 font-semibold text-emerald-400">
                        +{REFERRAL_BONUS_XLM}.00 XLM
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                          <Check className="size-3" />
                          Awarded
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default PlanterProfile;
