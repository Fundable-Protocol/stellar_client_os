"use client";

import React, { useState, useEffect } from "react";

export type WidgetTheme = "light" | "dark" | "forest";

export interface CampaignImpactWidgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string | number;
  campaignTitle: string;
  yearFounded?: number;
  treesPlanted?: number;
  co2OffsetTonnes?: number;
}

export interface SustainabilityInputs {
  /** Shannon Wiener index or equivalent (0-1) */
  treeSpeciesDiversity: number;
  /** 0-1 score for how well the species match the region climate */
  regionClimateImpact: number;
  /** 0-1 score for soil health improvement */
  soilHealthImprovement: number;
  /** 0-1 score for biodiversity potential */
  biodiversityPotential: number;
}

export interface SustainabilityBreakdown {
  key: keyof SustainabilityInputs;
  label: string;
  weight: number;
  value: number;
  contribution: number;
}

export interface SustainabilityScoreResult {
  score: number;
  grade: "Stuttgart" | "Silver" | "Gold" | "Platinum";
  breakdown: SustainabilityBreakdown[];
}

const SUSTAINABILITY_WEIGHTS: Record<keyof SustainabilityInputs, number> = {
  treeSpeciesDiversity: 0.3,
  regionClimateImpact: 0.25,
  soilHealthImprovement: 0.2,
  biodiversityPotential: 0.25,
};

const SUSTAINABILITY_LABELS: Record<keyof SustainabilityInputs, string> = {
  treeSpeciesDiversity: "Tree Species Diversity",
  regionClimateImpact: "Region Climate Impact",
  soilHealthImprovement: "Soil Health Improvement",
  biodiversityPotential: "Biodiversity Potential",
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

/**
 * Calculate a 0-100 campaign sustainability score from four weighted
 * environmental indices. Each input is expected in the 0-1 range and is
 * clamped before being weighted.
 */
export const calculateSustainabilityScore = (
  inputs: SustainabilityInputs,
): SustainabilityScoreResult => {
  const keys = Object.keys(SUSTAINABILITY_WEIGHTS) as Array<
    keyof SustainabilityInputs
  >;

  const breakdown: SustainabilityBreakdown[] = keys.map((key) => {
    const value = clamp01(inputs[key]);
    const weight = SUSTAINABILITY_WEIGHTS[key];
    return {
      key,
      label: SUSTAINABILITY_LABELS[key],
      weight,
      value,
      contribution: value * weight * 100,
    };
  });

  const rawScore = breakdown.reduce((acc, item) => acc + item.contribution, 0);
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  const grade: SustainabilityScoreResult["grade"] =
    score >= 85
      ? "Platinum"
      : score >= 70
        ? "Gold"
        : score >= 50
          ? "Silver"
          : "Stuttgart";

  return { score, grade, breakdown };
};

const gradeStyles: Record<SustainabilityScoreResult["grade"], string> = {
  Platinum: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  Gold: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  Silver: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  Stuttgart: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

/**
 * CampaignImpactWidgetModal Component (Issue #883)
 *
 * Allows campaign creators and sponsors to generate, preview, and copy
 * an embeddable iframe widget showing campaign progress, tree counter,
 * and CO2 impact for external websites.
 *
 * Also surfaces the campaign's 0-100 sustainability (environmental)
 * index derived from tree species diversity, region climate impact,
 * soil health improvement, and biodiversity potential.
 */
export const CampaignImpactWidgetModal: React.FC < CampaignImpactWidgetModalProps> = ({
  isOpen,
  onClose,
  campaignId,
  campaignTitle,
  yearFounded,
  treesPlanted,
  co2OffsetTonnes,
}) => {
  const [theme, setTheme] = useState<WidgetTheme>("forest");
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [sustainabilityInputs, setSustainabilityInputs] = useState<SustainabilityInputs>({
    treeSpeciesDiversity: 0.72,
    regionClimateImpact: 0.68,
    soilHealthImprovement: 0.6,
    biodiversityPotential: 0.75,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  if (!isOpen) return null;

  const embedUrl = `${origin || "https://fundable.stellar"}/api/campaigns/${campaignId}/widget?theme=${theme}`;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="360" frameborder="0" style="border:0;border-radius:14px;max-width:440px;display:block;margin:0 auto;overflow:hidden;" title="${campaignTitle} Impact Widget"></iframe>`;

  const sustainability = calculateSustainabilityScore(sustainabilityInputs);

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

  const handleInputChange = (key: keyof SustainabilityInputs, value: number) => {
    setSustainabilityInputs((prev) => ({ ...prev, [key]: clamp01(value / 100) }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="widget-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl width-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[W0vH]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 id="widget-modal-title" className="text-lg font-bold text-white">
              Embed Campaign Widget
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
Embed real-time tree and CO ₃ Impact on your website or blog.
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
              {
                [
                  { id: "forest", label: "🌱 Forest", desc: "Green & Emerald" },
                  { id: "dark", label: "🌍 Dark", desc: "Slate & Neon" },
                  { id: "light", label: "☀️ Light", desc: "Clean & Crisp" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`
                    p-2.5 rounded-xl border text-left transition
                    ${theme === t.id
                      ? "border-emerald-500 bg-emerald-950/40 text-white"
                      : "border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600"
                    }
                  }`}
                >
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sustainability Score - Environmental Index */}
          <div
            className="rounded-xl border border-slate-800 bg-slate-950/80 p-4"
            data-testid="campaign-sustainability-score"
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Sustainability Score
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Environmental index (0-100) from diversity, climate, soil and
                  biodiversity.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-4xl font-bold text-white leading-none">
                  {sustainability.score}
                  <span className="text-lg text-slate-400 font-medium">/100</span>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${gradeStyles[sustainability.grade]}`}
                >
                  {sustainability.grade}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {sustainability.breakdown.map((item) => (
                <div key={item.key}>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>
                      {item.label}
                      <span className="text-slate-500">
                        · {Math.round(item.weight * 100)}%%
                      </span>
                    </span>
                    <span className="font-medium text-slate-200">
                      {item.contribution.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round(item.value * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Interactive inputs to tune the index */}
            <details className="mt-4 group">
              <summary className="cursor-pointer text-xs font-semibold text-emerald-400 hover:text-emerald-300">
                Adjust indicators
              </summary>
              <div className="mt-3 space-y-3">
                {(sustainability.breakdown as SustainabilityBreakdown[]).map((item) => (
                  <div key={item.key}>
                    <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                      <span>{item.label}</span>
                      <span className="font-medium text-slate-200">
                        {Math.round(item.value * 100)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(item.value * 100)}
                      onChange={(e) => handleInputChange(item.key, Number(e.target.value))}
                      aria-label={`${item.label} indicator`}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* Live Preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Live Preview
            </label>
            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 flex justify-center">
              <iframe
                src={`/api/campaigns/${campaignId}/widget?theme=${theme}&score=${sustainability.score}`}
                width="100%"
                height="340"
                className="max-w-[420px] rounded-xl border-0 overflow-hidden"
                title={`${campaignTitle} Preview`}
              />
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
                {copied ? "✓ Copied!" : "🗉 Copy Code"}
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
