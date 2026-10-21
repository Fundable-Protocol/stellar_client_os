"use client";

import { useState } from "react";

interface Req {
  id: string;
  campaignId: string;
  amount: string;
  destination: string;
  status: string;
}

export default function TrusteeDashboardPage() {
  const [trustee, setTrustee] = useState("");
  const [items, setItems] = useState<Req[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/trustee/withdrawals?trustee=${encodeURIComponent(trustee)}&all=1`);
    const data = await res.json();
    if (res.ok) {
      setItems(data.data);
      setMessage(null);
    } else {
      setMessage(data.error ?? "Failed to load");
    }
  };

  const act = async (requestId: string, action: "cosign" | "reject") => {
    const res = await fetch("/api/trustee/withdrawals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, trustee, action }),
    });
    const data = await res.json();
    setMessage(res.ok ? (action === "cosign" ? "Co-signed" : "Rejected") : (data.error ?? "Failed"));
    if (res.ok) await load();
  };

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Trustee dashboard</h1>
      <div className="flex gap-2">
        <input className="flex-1 rounded border p-2" placeholder="Trustee account (G...)" value={trustee} onChange={(e) => setTrustee(e.target.value)} />
        <button className="rounded bg-green-700 px-4 py-2 text-white" disabled={!trustee} onClick={load}>
          Load
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded border p-3">
            <span>
              Campaign {r.campaignId}: {r.amount} → {r.destination} ({r.status})
            </span>
            {r.status === "PENDING" && (
              <span className="flex gap-2">
                <button className="rounded bg-green-700 px-3 py-1 text-white" onClick={() => act(r.id, "cosign")}>
                  Co-sign
                </button>
                <button className="rounded bg-red-700 px-3 py-1 text-white" onClick={() => act(r.id, "reject")}>
                  Reject
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
