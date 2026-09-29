"use client";

import React, { useState, useEffect } from "react";

export type WidgetTheme = "light" | "dark" | "forest";

export interface CampaignImpactWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string | number;
  campaignTitle: string;
}

const SPECIES_DIVERSITY_WEIGHTS = [0, 10, 25, 45, 70, 100] as const;

/**
 * CampaignImpactWidgetModal Component (Issue #883)
 *
 * Allows campaign creators and sponsors to generate, preview, and copy
 * an embeddable iframe widget showing campaign progress, tree counter,
 * and CO2 impact for external websites.
 */
export const CampaignImpactWidgetModal: React.FC<CampaignImpactWidgetModalProps> = ({
  isOpen,
  onClose,
  campaignId,
  campaignTitle,
}) => {
  const [theme, setTheme] = useState<WidgetTheme>("forest");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [speciesCount, setSpeciesCount] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !campaignId) return;
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/species`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const count = Array.isArray(data.species) ? data.species.length : Number(data.count) || 0;
        setSpeciesCount(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, campaignId]);

  if (!isOpen) return null;

  const embedUrl = `${origin || "https://fundable.stellar"}/api/campaigns/${campaignId}/widget?theme=${theme}`;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="360" frameborder="0" style="border:0;border-radius:14px;max-width:440px;display:block;margin:0 auto;overflow:hidden;" title="${campaignTitle} Impact Widget"></iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  const diversityScore =
    SPECIES_DIVERSITY_WEIGHTS[Math.min(speciesCount, SPECIES_DIVERSITY_WEIGHTS.length - 1)];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="widget-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 id="widget-modal-title" className="text-lg font-bold text-white">
              Embed Campaign Widget
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Embed real-time tree and CO₂ impact on your website or blog.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Theme Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select Widget Theme
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {(
                [
                  { id: "forest", label: "🌲 Forest", desc: "Green & Emerald" },
                  { id: "dark", label: "🌑 Dark", desc: "Slate & Neon" },
                  { id: "light", label: "☀️ Light", desc: "Clean & Crisp" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    theme === t.id
                      ? "border-emerald-500 bg-emerald-950/40 text-white"
                      : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Live Preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Live Preview
            </label>
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 flex justify-center">
              <iframe
                src={`/api/campaigns/${campaignId}/widget?theme=${theme}`}
                width="100%"
                height="340"
                className="max-w-[420px] rounded-xl border-0 overflow-hidden"
                title={`${campaignTitle} Preview`}
              />
            </div>
          </div>

          {/* Species Diversity Score */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Species Diversity Score
            </label>
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">
                  {speciesCount} {speciesCount === 1 ? "species" : "species"} detected
                </span>
                <span className="text-sm font-bold text-emerald-400">{diversityScore}/100</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${diversityScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* HTML Embed Code Snippet */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                HTML Embed Code
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1"
              >
                {copied ? "✓ Copied!" : "📋 Copy Code"}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all select-all">
              {embedCode}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
