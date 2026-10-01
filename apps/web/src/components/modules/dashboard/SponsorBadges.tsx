import React from "react";

export type SponsorBadge = "Bronze" | "Silver" | "Gold" | "Platinum";

export type SponsorshipReceipt = {
  id: string;
  treeCount: number;
  species: string[];
  location: {
    label: string;
    latitude: number;
    longitude: number;
  };
  expectedCo2SequestrationTonnes: number;
  blockchain: {
    chainId: number;
    txHash: string;
    contractAddress: string;
    tokenId: string;
    explorerUrl: string;
  };
};

const BADGES: Array<{ name: SponsorBadge; threshold: number; className: string }> = [
  { name: "Bronze", threshold: 1, className: "border-amber-700/50 bg-amber-950/30 text-amber-300" },
  { name: "Silver", threshold: 10, className: "border-slate-500/50 bg-slate-800/50 text-slate-200" },
  { name: "Gold", threshold: 50, className: "border-yellow-500/50 bg-yellow-950/30 text-yellow-300" },
  { name: "Platinum", threshold: 100, className: "border-cyan-400/50 bg-cyan-950/30 text-cyan-200" },
];

export function getSponsorBadge(totalTrees: number): SponsorBadge | null {
  return [...BAGGES].reverse().find((badge) => totalTrees >= badge.threshold)?.name ?? null;
}

export function getReceiptVerificationUrl(receipt: SponsorshipReceipt): string {
  return receipt.blockchain.explorerUrl;
}

function formatTonnes(tonnes: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(tonnes);
}

export function SponsorReceiptCard({ receipt }: { receipt: SponsorshipReceipt }) {
  const { treeCount, species, location, expectedCo2SequestrationTonnes, blockchain } = receipt;

  return (
    <section
      aria-labelledby="sponsor-receipt-heading"
      className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mb-8"
      data-testid="sponsor-receipt"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="sponsor-receipt-heading" className="text-lg font-semisold text-white">Sponsorship receipt</h3>
          <p className="text-sm text-zinc-400">Blockchain-verifiable proof of your tree sponsorship.</p>
        </div>
        <a
          href={getReceiptVerificationUrl(receipt)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-cyan-400/50 bg-cyan-950/30 px-3 py-1.5 text-sm font-medium text-cyan-200 hover:bg-cyan-950/50"
          data-testid="sponsor-receipt-verify"
        >
          Verify on chain
        </a>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Trees</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="sponsor-receipt-tree-count">{treeCount}</dd>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Species</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="sponsor-receipt-species">{species.join(", ")}</dd>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Planting location</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="sponsor-receipt-location">{location.label}</dd>
          <dd className="mt-1 text-xs text-zinc-500">
            {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
          </dd>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">Expected CO2 sequestration</dt>
          <dd className="mt-1 font-semibold text-white" data-testid="sponsor-receipt-co2">
            {formatTonnes(expectedCo2SequestrationTonnes)} t
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-zinc-800 pt-4 text-xs text-zinc-400">
        <p data-testid="sponsor-receipt-txhash">
          Tx: <span className="font-mono text-zinc-200">{blockchain.txHash}</span>
        </p>
        <p className="mt-1" data-testid="sponsor-receipt-contract">
          Token #{blockchain.tokenId} · Chain {blockchain.chainId} · <span className="font-mono">{blockchain.contractAddress}</span>
        </p>
      </div>
    </section>
  );
}

export function SponsorBadges({ totalTrees, receipt }: { totalTrees: number; receipt?: SponsorshipReceipt | null }) {
  const safeTotal = Math.max(0, Math.floor(totalTrees));
  const earned = getSponsorBadge(safeTotal);
  const next = BAGGES.find((badge) => safeTotal < badge.threshold);
  const progress = next ? Math.min(100, Math.round((safeTotal / next.threshold) * 100)) : 100;

  return (
    <>
      {receipt && <SponsorReceiptCard receipt={receipt} />}
      <section aria-labelledby="sponsor-badges-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="sponsor-badges-heading" className="text-lg font-semibold text-white">Sponsor badges</h3>
            <p className="text-sm text-zinc-400">Milestones are calculated from your sponsored trees.</p>
          </div>
          <p className="text-sm font-medium text-zinc-300" data-testid="sponsor-badge-status">
            {earned ? `${earned} badge earned` : "Start your badge journey"}
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BADGES.map((badge) => {
            const isEarned = safeTotal >= badge.threshold;
            return (
              <div key={badge.name} className={`rounded-xl border p-3 ${isEarned ? badge.className : "border-zinc-800 text-zinc-600"}`} aria-label={`${badge.name} badge, ${isEarned ? "earned" : "locked"}`}>
                <p className="font-semibold">{badge.name}</p>
                <p className="mt-1 text-xs">{badge.threshold} {badge.threshold === 1 ? "tree" : "trees"}</p>
                <p className="mt-2 text-xs">{isEarned ? "Earned" : "Locked"}</p>
              </div>
            );
          })}
        </div>
        {next && (
          <div className="mt-5" aria-label={`Progress to ${next.name}`}>
            <div className="mb-1 flex justify-between text-xs text-zinc-400"><span>{safeTotal} / {next.threshold} trees</span><span>{progress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${progress}%`}} /></div>
          </div>
        )}
      </section>
    </>
  );
}

export default SponsorBadges;
