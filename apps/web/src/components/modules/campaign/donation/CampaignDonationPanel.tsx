"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Heart, Receipt, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/providers/StellarWalletProvider";
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
import { ContributionFrequency } from "@/types/recurring-contributions";
import { Repeat, Calendar } from "lucide-react";

export interface CampaignDonationPanelProps {
  campaignId: string;
  campaignName?: string;
  defaultToken?: DonationToken;
}

interface DonationResponse {
  receipt: DonationReceipt;
}

/**
 * Charitable donation form with recurring monthly support option.
 *
 * Donors pick any whole-token amount and give it straight to the campaign —
 * either as a one-time contribution or an ongoing monthly subscription.
 */
export function CampaignDonationPanel({
  campaignId,
  campaignName,
  defaultToken = "XLM",
}: CampaignDonationPanelProps) {
  const { address, isConnected, openModal } = useWallet();

  const [frequency, setFrequency] = useState<ContributionFrequency>("ONE_TIME");
  const [amount, setAmount] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [token, setToken] = useState<DonationToken>(defaultToken);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);

  const reset = () => {
    setFrequency("ONE_TIME");
    setAmount("");
    setDonorName("");
    setDonorEmail("");
    setMessage("");
    setAnonymous(false);
    setError("");
    setReceipt(null);
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
          frequency,
          isRecurring: frequency === "MONTHLY",
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
              {receipt.amount} {receipt.token} {receipt.frequency === "MONTHLY" || receipt.isRecurring ? "(Monthly)" : ""}
            </dd>
          </div>
          {(receipt.frequency === "MONTHLY" || receipt.isRecurring) && (
            <div className="flex justify-between gap-4 p-3 text-sm">
              <dt className="text-zinc-400">Contribution Cadence</dt>
              <dd className="text-emerald-400 font-medium">Recurring Monthly Subscription</dd>
            </div>
          )}
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

      {/* Contribution Frequency Toggle (#Acceptance Criteria 1) */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-zinc-300 mb-2">
          Contribution Type
        </label>
        <div
          role="radiogroup"
          aria-label="Contribution Type"
          data-testid="frequency-toggle-group"
          className="grid grid-cols-2 gap-3"
        >
          <button
            type="button"
            data-testid="toggle-frequency-one-time"
            aria-checked={frequency === "ONE_TIME"}
            role="radio"
            onClick={() => setFrequency("ONE_TIME")}
            className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition ${
              frequency === "ONE_TIME"
                ? "border-emerald-500 bg-emerald-500/10 text-white shadow-sm ring-1 ring-emerald-500"
                : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            }`}
          >
            <span>One-Time</span>
          </button>
          <button
            type="button"
            data-testid="toggle-frequency-monthly"
            aria-checked={frequency === "MONTHLY"}
            role="radio"
            onClick={() => setFrequency("MONTHLY")}
            className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition ${
              frequency === "MONTHLY"
                ? "border-emerald-500 bg-emerald-500/10 text-white shadow-sm ring-1 ring-emerald-500"
                : "border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            }`}
          >
            <Repeat className="w-4 h-4 text-emerald-400" />
            <span>Recurring Monthly</span>
          </button>
        </div>
        {frequency === "MONTHLY" && (
          <p className="mt-2 text-xs text-emerald-300/90 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            Support this creator automatically every month. Cancel or pause anytime in your backer dashboard.
          </p>
        )}
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
        {submitting
          ? "Recording contribution…"
          : frequency === "MONTHLY"
          ? `Subscribe monthly with ${amount ? `${amount} ${token}` : "monthly support"}`
          : `Donate ${amount ? `${amount} ${token}` : "now"}`}
      </Button>
    </section>
  );
}
