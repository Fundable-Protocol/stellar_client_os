"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Heart, Receipt, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/providers/StellarWalletProvider";
import { PledgeThankYouContent, type PledgeThankYouDetails } from "@/components/modules/campaign/thank-you/PledgeThankYouContent";
import { PersonalizedCampaignRecommendations } from "@/components/campaign/PersonalizedCampaignRecommendations";
import {
  DONATION_ALLOCATION_DESCRIPTION,
  DONATION_PRESET_AMOUNTS,
  DONATION_TOKENS,
  DonationReceipt,
  DonationToken,
  MAX_DONATION_MESSAGE_LENGTH,
  maskDonorAddress,
  validateDonationAmount,
} from "@/types/campaign-donation";

export interface CampaignDonationPanelProps {
  campaignId: string;
  campaignName?: string;
  defaultToken?: DonationToken;
}

interface DonationResponse {
  receipt: DonationReceipt;
  badges?: Array<{ key: string; name: string; description: string; icon: string }>;
}

/**
 * One-time charitable donation form (issue #1001).
 *
 * Donors pick any whole-token amount and give it straight to the campaign —
 * none of it is tied to a specific tree. Funds are released to the creator's
 * discretion for project costs, and every donation returns a receipt.
 *
 * As of the campaign insurance pool feature (v1), 1% of every donation is
 * allocated to the campaign insurance pool. The pool protects sponsors against
 * tree loss: when trees die within two years of planting, a percentage is
 * automatically refunded to sponsors from the pool.
 */
export function CampaignDonationPanel({
  campaignId,
  campaignName,
  defaultToken = "XLM",
}: CampaignDonationPanelProps) {
  const { address, isConnected, openModal } = useWallet();

  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [token, setToken] = useState<DonationToken>(defaultToken);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [thankYouDetails, setThankYouDetails] = useState<PledgeThankYouDetails | null>(null);
  const [thankYouError, setThankYouError] = useState<string | null>(null);
  const [loadingThankYou, setLoadingThankYou] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    let active = true;
    setLoadingThankYou(true);
    setThankYouError(null);
    fetch(`/api/campaigns/${campaignId}/thank-you`)
      .then(async (response) => {
        const body = (await response.json()) as PledgeThankYouDetails & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Could not load the creator's thank-you message.");
        if (active) setThankYouDetails(body);
      })
      .catch((cause: unknown) => {
        if (active) setThankYouError(cause instanceof Error ? cause.message : "Could not load the creator's thank-you message.");
      })
      .finally(() => {
        if (active) setLoadingThankYou(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, receipt]);
  const [earnedBadges, setEarnedBadges] = useState<DonationResponse["badges"]>([]);

  const reset = () => {
    setAmount("");
    setDonorName("");
    setDonorEmail("");
    setMessage("");
    setAnonymous(false);
    setError("");
    setReceipt(null);
    setEarnedBadges([]);
    setThankYouDetails(null);
    setThankYouError(null);
  };

  const submit = async () => {
    setError("");

    const amountError = validateDonationAmount(amount);
    if (amountError) {
      setError(amountError);
      return;
    }
    if (!isConnected || !address) {
      setError("Connect your wallet to donate.");
      openModal();
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/donations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          donorAddress: address,
          donorName: donorName.trim() || undefined,
          donorEmail: donorEmail.trim() || undefined,
          amount,
          token,
          message: message.trim() || undefined,
          anonymous,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        const errorMessage = body.error ?? "We could not record your donation. Please try again.";
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      const body = (await response.json()) as DonationResponse;
      setReceipt(body.receipt);
      setEarnedBadges(body.badges ?? []);
      toast.success("Thank you for your donation!");
    } catch {
      setError("Network error — please check your connection and try again.");
      toast.error("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <section
        data-testid="donation-receipt"
        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6"
      >
        <div className="flex items-center gap-2 text-emerald-300">
          <Receipt className="h-5 w-5" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Donation confirmed</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-300">
          Thank you — your contribution goes straight to the campaign creator.
        </p>
        {loadingThankYou && <p className="mt-4 text-sm text-zinc-400">Loading the creator&apos;s message…</p>}
        {thankYouError && <p role="alert" className="mt-4 text-sm text-rose-400">{thankYouError}</p>}
        {!loadingThankYou && !thankYouError && (
          <PledgeThankYouContent details={thankYouDetails ?? { greeting: "Thank you for backing this campaign." }} />
        )}
        {earnedBadges.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4" aria-live="polite">
            <h3 className="font-semibold text-amber-200">Badge progress unlocked</h3>
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Newly earned backer badges">
              {earnedBadges.map((badge) => <li key={badge.key} className="rounded-full border border-amber-400/30 px-3 py-1 text-sm text-amber-100">{badge.icon} {badge.name}</li>)}
            </ul>
          </div>
        )}

        <dl className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10">
          <div className="flex justify-between gap-4 p-3 text-sm">
            <dt className="text-zinc-400">Receipt reference</dt>
            <dd data-testid="donation-reference" className="font-mono text-zinc-100">
              {receipt.reference}
            </dd>
          </div>
          <div className="flex justify-between gap-4 p-3 text-sm">
            <dt className="text-zinc-400">Amount</dt>
            <dd className="text-zinc-100">
              {receipt.amount} {receipt.token}
            </dd>
          </div>
          <div className="flex justify-between gap-4 p-3 text-sm">
            <dt className="text-zinc-400">Allocated to</dt>
            <dd className="text-zinc-100">{receipt.allocationLabel}</dd>
          </div>
          <div className="flex justify-between gap-4 p-3 text-sm">
            <dt className="text-zinc-400">Donor</dt>
            <dd className="text-zinc-100">
              {anonymous ? "Anonymous" : maskDonorAddress(receipt.donorAddress)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-zinc-400">{receipt.allocationDescription}</p>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span data-testid="donation-insurance-notice">
            1% of your donation funds the campaign insurance pool. If trees die within
            two years of planting, sponsors receive an automatic refund from the pool.
          </span>
        </div>

        <div className="mt-6">
          <PersonalizedCampaignRecommendations />
        </div>

        <Button type="button" variant="outline" className="mt-6" onClick={reset}>
          Make another donation
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
      <div className="flex items-center gap-2">
        <Heart className="h-5 w-5 text-rose-400" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-zinc-100">
          Donate to {campaignName ?? "this campaign"}
        </h2>
      </div>
      <p className="mt-2 text-sm text-zinc-400">{DONATION_ALLOCATION_DESCRIPTION}</p>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span data-testid="donation-insurance-notice">
          1% of every donation funds the campaign insurance pool. If trees die within
          two years of planting, sponsors receive an automatic refund from the pool.
        </span>
      </div>

      <div className="mt-6">
        <span className="block text-sm text-zinc-300">Quick amounts</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DONATION_PRESET_AMOUNTS.map((preset) => (
            <button
              key={preset}
              type="button"
              data-testid={`donation-preset-${preset}`}
              aria-pressed={amount === preset}
              onClick={() => setAmount(preset)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                amount === preset
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 text-zinc-300 hover:border-white/30"
              }`}
            >
              {preset} {token}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="donation-amount" className="block text-sm text-zinc-300">
            Donation amount
          </label>
          <Input
            id="donation-amount"
            data-testid="donation-amount"
            inputMode="numeric"
            min="1"
            step="1"
            placeholder="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <label htmlFor="donation-token" className="block text-sm text-zinc-300">
            Token
          </label>
          <select
            id="donation-token"
            data-testid="donation-token"
            value={token}
            onChange={(event) => setToken(event.target.value as DonationToken)}
            className="mt-2 h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100"
          >
            {DONATION_TOKENS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="donation-donor-name" className="block text-sm text-zinc-300">
            Your name (optional)
          </label>
          <Input
            id="donation-donor-name"
            data-testid="donation-donor-name"
            maxLength={120}
            autoComplete="name"
            value={donorName}
            onChange={(event) => setDonorName(event.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <label htmlFor="donation-donor-email" className="block text-sm text-zinc-300">
            Email for a thank-you note (optional)
          </label>
          <Input
            id="donation-donor-email"
            data-testid="donation-donor-email"
            type="email"
            autoComplete="email"
            value={donorEmail}
            onChange={(event) => setDonorEmail(event.target.value)}
            className="mt-2"
          />
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="donation-message" className="block text-sm text-zinc-300">
          Message to the creator (optional)
        </label>
        <textarea
          id="donation-message"
          data-testid="donation-message"
          rows={3}
          maxLength={MAX_DONATION_MESSAGE_LENGTH}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Add a note of encouragement…"
          className="mt-2 w-full rounded-md border border-white/10 bg-black/30 p-3 text-sm text-zinc-100"
        />
        <p className="mt-1 text-right text-xs text-zinc-500">
          {message.length}/{MAX_DONATION_MESSAGE_LENGTH}
        </p>
      </div>

      <label className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          data-testid="donation-anonymous"
          checked={anonymous}
          onChange={(event) => setAnonymous(event.target.checked)}
        />
        Donate anonymously
      </label>

      {error && (
        <p role="alert" data-testid="donation-error" className="mt-5 text-sm text-red-300">
          {error}
        </p>
      )}

      <Button
        type="button"
        data-testid="donation-submit"
        disabled={submitting}
        onClick={submit}
        className="mt-6"
      >
        {submitting ? "Recording donation…" : `Donate ${amount ? `${amount} ${token}` : "now"}`}
      </Button>
    </section>
  );
}
