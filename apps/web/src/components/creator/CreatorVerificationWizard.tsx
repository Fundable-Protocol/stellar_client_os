"use client";

import React, { useCallback, useContext, useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, Mail, Phone, IdCard, Wallet, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";
import { WalletContext } from "@/providers/StellarWalletProvider";
import {
  CREATOR_VERIFICATION_STEP_DETAILS,
  CREATOR_VERIFICATION_STEPS,
  GOVERNMENT_ID_DOCUMENT_TYPES,
  VERIFIED_CREATOR_BADGE_LABEL,
  type CampaignVerificationSummary,
  type CreatorVerificationStep,
  type CreatorVerificationStepStatus,
} from "@/lib/creator-verification";
import { CreatorVerificationBadge } from "./CreatorVerificationBadge";

interface StepView {
  step: CreatorVerificationStep;
  status: CreatorVerificationStepStatus;
  verifiedAt?: number;
  maskedTarget?: string;
  expiresAt?: number;
  documentType?: string;
  issuingCountry?: string;
  rejectionReason?: string;
}

interface VerificationView {
  creator: string;
  summary: CampaignVerificationSummary;
  steps: StepView[];
}

const STEP_ICONS: Record<CreatorVerificationStep, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  phone: Phone,
  government_id: IdCard,
};

const DOCUMENT_LABELS: Record<(typeof GOVERNMENT_ID_DOCUMENT_TYPES)[number], string> = {
  passport: "Passport",
  national_id: "National ID card",
  drivers_license: "Driver's licence",
};

const SESSION_STORAGE_KEY = "fundable_creator_verification_session";

function StatusPill({ status }: { status: CreatorVerificationStepStatus }) {
  const map: Record<CreatorVerificationStepStatus, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> | null }> = {
    verified: { label: "Verified", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    pending: { label: "Pending", className: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
    rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
    not_started: { label: "Not started", className: "bg-gray-50 text-gray-600 border-gray-200", Icon: null },
  };
  const { label, className, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {label}
    </span>
  );
}

/**
 * Optional identity verification wizard for campaign creators.
 *
 * 0. Sign a challenge with the creator wallet (proves address ownership).
 * 1. Verify email with a one-time code.
 * 2. Verify phone with a one-time SMS code.
 * 3. Submit a government ID for review.
 * Completing all steps earns the "Verified Creator" badge on every campaign.
 */
export function CreatorVerificationWizard({ address }: { address: string }) {
  const wallet = useContext(WalletContext);
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<VerificationView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [documentType, setDocumentType] = useState<(typeof GOVERNMENT_ID_DOCUMENT_TYPES)[number]>("passport");
  const [issuingCountry, setIssuingCountry] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const base = `/api/creators/${encodeURIComponent(address)}/verification`;
  const isOwnerWallet = wallet?.address === address;

  const request = useCallback(
    async (path: string, init: RequestInit = {}, sessionToken: string | null = token) => {
      const res = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
          ...(init.headers ?? {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Request failed");
      return data;
    },
    [base, token],
  );

  const refresh = useCallback(
    async (sessionToken: string | null = token) => {
      try {
        const data = await request("", { method: "GET" }, sessionToken);
        setView(data.verification as VerificationView);
        if (sessionToken && !data.owner) {
          // Session expired or belongs to another address.
          setToken(null);
          sessionStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load verification status");
      }
    },
    [request, token],
  );

  useEffect(() => {
    let stored: string | null = null;
    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as { address: string; token: string; expiresAt: number }) : null;
      if (parsed && parsed.address === address && parsed.expiresAt > Date.now()) stored = parsed.token;
    } catch {
      stored = null;
    }
    setToken(stored);
    void refresh(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const startSession = () =>
    run("session", async () => {
      if (!wallet) throw new Error("Wallet support is unavailable on this page");
      if (!wallet.isConnected) {
        wallet.openModal();
        throw new Error("Connect the wallet that owns this creator address, then try again");
      }
      if (!isOwnerWallet) throw new Error("The connected wallet does not match this creator address");
      const challenge = await request("/session", { method: "POST", body: JSON.stringify({ action: "challenge" }) }, null);
      const { signedMessage } = await wallet.signMessage(challenge.message);
      const session = await request(
        "/session",
        { method: "POST", body: JSON.stringify({ action: "verify", nonce: challenge.nonce, signature: signedMessage }) },
        null,
      );
      setToken(session.token);
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ address, token: session.token, expiresAt: session.expiresAt }));
      await refresh(session.token);
    });

  const sendCode = (step: "email" | "phone") => (event: FormEvent) => {
    event.preventDefault();
    void run(`${step}-start`, async () => {
      const data = await request(`/${step}`, {
        method: "POST",
        body: JSON.stringify(step === "email" ? { action: "start", email } : { action: "start", phone }),
      });
      setView(data.verification);
      setNotice(
        `Code sent to ${data.dispatch.maskedTarget}.${data.dispatch.devCode ? ` Development code: ${data.dispatch.devCode}` : ""}`,
      );
    });
  };

  const confirmCode = (step: "email" | "phone") => (event: FormEvent) => {
    event.preventDefault();
    void run(`${step}-confirm`, async () => {
      const data = await request(`/${step}`, {
        method: "POST",
        body: JSON.stringify({ action: "confirm", code: step === "email" ? emailCode : phoneCode }),
      });
      setView(data.verification);
      if (step === "email") setEmailCode("");
      else setPhoneCode("");
      setNotice(`${step === "email" ? "Email address" : "Phone number"} verified.`);
    });
  };

  const submitGovernmentId = (event: FormEvent) => {
    event.preventDefault();
    void run("government_id", async () => {
      if (!documentFile) throw new Error("Choose a photo or PDF of your document");
      const upload = await request("/government-id/upload", {
        method: "POST",
        body: JSON.stringify({ contentType: documentFile.type }),
      });
      const put = await fetch(upload.url, { method: "PUT", headers: { "content-type": upload.contentType }, body: documentFile });
      if (!put.ok) throw new Error("Document upload failed");
      const data = await request("/government-id", {
        method: "POST",
        body: JSON.stringify({ documentType, issuingCountry: issuingCountry.trim().toUpperCase(), documentReference: upload.key }),
      });
      setView(data.verification);
      setDocumentFile(null);
      setNotice("Document submitted. A reviewer will confirm it shortly.");
    });
  };

  const withdraw = () =>
    run("withdraw", async () => {
      const data = await request("", { method: "DELETE" });
      setView(data.verification);
      setNotice("Verification withdrawn and stored data erased.");
    });

  const stepOf = (step: CreatorVerificationStep): StepView =>
    view?.steps.find((item) => item.step === step) ?? { step, status: "not_started" };
  const summary = view?.summary;
  const inputClass = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500";
  const buttonClass = "inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60";

  return (
    <section aria-label="Creator identity verification" className="space-y-6">
      <header className="rounded-lg bg-white p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Creator identity verification</h1>
            <p className="mt-1 text-sm text-gray-600">
              Optional. Verify your email, phone and government ID to earn the{" "}
              <strong>{VERIFIED_CREATOR_BADGE_LABEL}</strong> badge on all your campaigns and in search results.
            </p>
          </div>
          {summary && (
            <div className="flex items-center gap-2" aria-live="polite">
              <CreatorVerificationBadge verification={summary} size="md" />
              <span className="text-sm text-gray-600">
                {summary.verifiedCount} / {summary.totalCount} complete
              </span>
            </div>
          )}
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Verification progress">
          {CREATOR_VERIFICATION_STEPS.map((step, index) => {
            const Icon = STEP_ICONS[step];
            return (
              <li key={step} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-gray-800">
                  <Icon className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  {index + 1}. {CREATOR_VERIFICATION_STEP_DETAILS[step].badgeLabel}
                </span>
                <StatusPill status={stepOf(step).status} />
              </li>
            );
          })}
        </ol>
      </header>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={`rounded-md px-4 py-2 text-sm ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {error || notice}
        </p>
      )}

      {!token ? (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Wallet className="h-5 w-5" aria-hidden="true" /> Confirm you own this creator address
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Sign a one-time message with your Stellar wallet. No transaction is submitted and no fees are charged.
          </p>
          <button type="button" className={`${buttonClass} mt-4`} onClick={startSession} disabled={busy !== null}>
            {busy === "session" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {wallet?.isConnected ? "Sign with wallet" : "Connect wallet"}
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {(["email", "phone"] as const).map((step) => {
            const state = stepOf(step);
            const Icon = STEP_ICONS[step];
            const isEmail = step === "email";
            return (
              <article key={step} className="rounded-lg bg-white p-6 shadow-md" aria-labelledby={`verify-${step}-title`}>
                <h2 id={`verify-${step}-title`} className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Icon className="h-5 w-5" aria-hidden="true" /> {CREATOR_VERIFICATION_STEP_DETAILS[step].label}
                </h2>
                <p className="mt-1 text-sm text-gray-600">{CREATOR_VERIFICATION_STEP_DETAILS[step].description}</p>
                {state.status === "verified" && (
                  <p className="mt-3 text-sm text-emerald-700">Verified{state.maskedTarget ? `: ${state.maskedTarget}` : ""}</p>
                )}
                <form onSubmit={sendCode(step)} className="mt-4 space-y-2">
                  <label className="block text-xs font-medium text-gray-700">
                    {isEmail ? "Email address" : "Phone number"}
                    <input
                      className={`${inputClass} mt-1`}
                      type={isEmail ? "email" : "tel"}
                      autoComplete={isEmail ? "email" : "tel"}
                      placeholder={isEmail ? "you@example.org" : "+2348012345678"}
                      value={isEmail ? email : phone}
                      onChange={(event) => (isEmail ? setEmail(event.target.value) : setPhone(event.target.value))}
                      required
                    />
                  </label>
                  <button type="submit" className={buttonClass} disabled={busy !== null}>
                    {busy === `${step}-start` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {state.status === "pending" ? "Resend code" : state.status === "verified" ? "Change and re-verify" : "Send code"}
                  </button>
                </form>
                {state.status === "pending" && (
                  <form onSubmit={confirmCode(step)} className="mt-4 space-y-2">
                    <label className="block text-xs font-medium text-gray-700">
                      6-digit code sent to {state.maskedTarget}
                      <input
                        className={`${inputClass} mt-1 tracking-widest`}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="\d{6}"
                        maxLength={6}
                        value={isEmail ? emailCode : phoneCode}
                        onChange={(event) => (isEmail ? setEmailCode(event.target.value) : setPhoneCode(event.target.value))}
                        required
                      />
                    </label>
                    <button type="submit" className={buttonClass} disabled={busy !== null}>
                      {busy === `${step}-confirm` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Verify code
                    </button>
                  </form>
                )}
              </article>
            );
          })}

          <article className="rounded-lg bg-white p-6 shadow-md" aria-labelledby="verify-government-id-title">
            <h2 id="verify-government-id-title" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <IdCard className="h-5 w-5" aria-hidden="true" /> {CREATOR_VERIFICATION_STEP_DETAILS.government_id.label}
            </h2>
            <p className="mt-1 text-sm text-gray-600">{CREATOR_VERIFICATION_STEP_DETAILS.government_id.description}</p>
            {stepOf("government_id").status === "pending" && (
              <p className="mt-3 text-sm text-amber-700">Your document is awaiting review.</p>
            )}
            {stepOf("government_id").status === "verified" && <p className="mt-3 text-sm text-emerald-700">Government ID verified.</p>}
            {stepOf("government_id").status === "rejected" && (
              <p className="mt-3 text-sm text-rose-700">Rejected: {stepOf("government_id").rejectionReason}. You can submit a new document.</p>
            )}
            {(stepOf("government_id").status === "not_started" || stepOf("government_id").status === "rejected") && (
              <form onSubmit={submitGovernmentId} className="mt-4 space-y-2">
                <label className="block text-xs font-medium text-gray-700">
                  Document type
                  <select className={`${inputClass} mt-1`} value={documentType} onChange={(event) => setDocumentType(event.target.value as typeof documentType)}>
                    {GOVERNMENT_ID_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>{DOCUMENT_LABELS[type]}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-700">
                  Issuing country (ISO code)
                  <input
                    className={`${inputClass} mt-1 uppercase`}
                    placeholder="NG"
                    maxLength={2}
                    value={issuingCountry}
                    onChange={(event) => setIssuingCountry(event.target.value)}
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-gray-700">
                  Document photo or PDF
                  <input
                    className="mt-1 block w-full text-sm text-gray-700"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                    required
                  />
                </label>
                <button type="submit" className={buttonClass} disabled={busy !== null}>
                  {busy === "government_id" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Submit for review
                </button>
              </form>
            )}
          </article>
        </div>
      )}

      {token && summary && summary.verifiedCount > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          <BadgeCheck className="mr-1 inline h-4 w-4 text-gray-400" aria-hidden="true" />
          Verification is optional. You can{" "}
          <button type="button" className="font-medium text-rose-600 underline" onClick={withdraw} disabled={busy !== null}>
            withdraw and erase your verification data
          </button>{" "}
          at any time; the badge will be removed from your campaigns.
        </div>
      )}
    </section>
  );
}

export default CreatorVerificationWizard;
