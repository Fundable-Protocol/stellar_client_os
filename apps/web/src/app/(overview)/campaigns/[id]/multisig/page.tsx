"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Status {
  creator: string;
  goalAmount: string;
  threshold: string;
  requiresMultisig: boolean;
  setup: { trustee: string } | null;
  trustees: string[];
}
interface WithdrawalRequest {
  id: string;
  amount: string;
  destination: string;
  status: string;
  signatures: { role: string }[];
}

export default function MultisigSetupWizardPage() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<Status | null>(null);
  const [step, setStep] = useState(1);
  const [caller, setCaller] = useState("");
  const [trustee, setTrustee] = useState("");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/campaigns/${id}/multisig`);
    if (res.ok) setStatus(await res.json());
    const w = await fetch(`/api/campaigns/${id}/multisig/withdrawals`);
    if (w.ok) setRequests((await w.json()).data);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const post = async (url: string, body: unknown, ok: string) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setMessage(res.ok ? ok : (data.error ?? "Request failed"));
    if (res.ok) await load();
    return res.ok;
  };

  if (!status) return <main className="p-8">Loading…</main>;
  if (!status.requiresMultisig) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Multi-signature withdrawals</h1>
        <p className="mt-4">
          This campaign (goal {status.goalAmount}) is below the multi-sig threshold of {status.threshold}.
        </p>
      </main>
    );
  }

  const setupDone = Boolean(status.setup);

  return (
    <main className="mx-auto max-w-xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Multi-signature setup</h1>
      <p>
        Goal {status.goalAmount} meets the threshold of {status.threshold}. Withdrawals need your signature and a
        platform trustee&apos;s co-signature.
      </p>

      {!setupDone && step === 1 && (
        <section className="space-y-3">
          <h2 className="font-medium">Step 1: Confirm creator account</h2>
          <input
            className="w-full rounded border p-2"
            placeholder="Creator account (G...)"
            value={caller}
            onChange={(e) => setCaller(e.target.value)}
          />
          <button className="rounded bg-green-700 px-4 py-2 text-white" disabled={!caller} onClick={() => setStep(2)}>
            Next
          </button>
        </section>
      )}

      {!setupDone && step === 2 && (
        <section className="space-y-3">
          <h2 className="font-medium">Step 2: Choose a platform trustee</h2>
          <select className="w-full rounded border p-2" value={trustee} onChange={(e) => setTrustee(e.target.value)}>
            <option value="">Select trustee</option>
            {status.trustees.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-green-700 px-4 py-2 text-white"
            disabled={!trustee}
            onClick={() => post(`/api/campaigns/${id}/multisig`, { callerAddress: caller, trustee }, "Multi-sig enabled")}
          >
            Enable multi-sig
          </button>
        </section>
      )}

      {setupDone && (
        <section className="space-y-3">
          <h2 className="font-medium">Request withdrawal (trustee: {status.setup?.trustee})</h2>
          <input className="w-full rounded border p-2" placeholder="Your account (G...)" value={caller} onChange={(e) => setCaller(e.target.value)} />
          <input className="w-full rounded border p-2" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="w-full rounded border p-2" placeholder="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} />
          <button
            className="rounded bg-green-700 px-4 py-2 text-white"
            onClick={() =>
              post(`/api/campaigns/${id}/multisig/withdrawals`, { callerAddress: caller, amount, destination }, "Withdrawal requested; awaiting trustee")
            }
          >
            Sign &amp; request
          </button>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded border p-2">
                <span>
                  {r.amount} → {r.destination} ({r.status}, {r.signatures.length}/2 signatures)
                </span>
                {r.status === "APPROVED" && (
                  <button
                    className="rounded bg-blue-700 px-3 py-1 text-white"
                    onClick={() => post(`/api/campaigns/${id}/multisig/withdrawals/${r.id}/release`, { callerAddress: caller }, "Funds released")}
                  >
                    Release
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {message && <p role="status">{message}</p>}
    </main>
  );
}
