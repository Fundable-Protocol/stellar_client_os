"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { AlertTriangle, Calculator } from "lucide-react";
import {
  calculateBackerRoi,
  getPledgeSliderRange,
  type CampaignInvestmentTerms,
} from "@/lib/backer-roi";
import { useTranslation } from "@/i18n/I18nProvider";
import { cn } from "@/lib/utils";

interface BackerRoiCalculatorProps {
  campaignId: string;
  /** Pass terms directly (e.g. a live preview in the editor) to skip fetching. */
  terms?: CampaignInvestmentTerms | null;
  className?: string;
}

/**
 * Interactive return estimator for revenue-sharing / equity campaigns (#1244).
 * Renders nothing for campaigns without investment terms.
 */
export function BackerRoiCalculator({ campaignId, terms: providedTerms, className }: BackerRoiCalculatorProps) {
  const { t, formatNumber } = useTranslation();
  const ids = useId();
  const [fetchedTerms, setFetchedTerms] = useState<CampaignInvestmentTerms | null>(null);
  const terms = providedTerms !== undefined ? providedTerms : fetchedTerms;

  useEffect(() => {
    if (providedTerms !== undefined) return;
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/investment-terms`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { terms?: CampaignInvestmentTerms | null } | null) => {
        if (!cancelled) setFetchedTerms(data?.terms ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId, providedTerms]);

  const range = useMemo(() => (terms ? getPledgeSliderRange(terms) : null), [terms]);
  const [pledgeInput, setPledge] = useState<number | null>(null);

  if (!terms || !range) return null;

  // Until the backer moves the slider, start at ~1% of the goal; always keep
  // the value inside the creator's pledge limits.
  const pledge = Math.min(Math.max(pledgeInput ?? Math.round(terms.fundingGoal / 100), range.min), range.max);
  const projection = calculateBackerRoi(terms, pledge);
  const money = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 2 })} ${terms.currency}`;
  const maxPayout = Math.max(...projection.years.map((y) => y.payout), 0);

  const stats = [
    { label: t("roi.yourShare"), value: formatNumber(projection.poolShare, { style: "percent", maximumFractionDigits: 3 }) },
    { label: t("roi.annualPayout"), value: money(projection.firstYearPayout) },
    { label: t("roi.totalReturn"), value: money(projection.totalReturn) },
    {
      label: t("roi.netProfit"),
      value: money(projection.netProfit),
      tone: projection.netProfit >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: t("roi.roi"),
      value: `${formatNumber(projection.roiPercent, { maximumFractionDigits: 1 })}%`,
      tone: projection.roiPercent >= 0 ? "text-emerald-400" : "text-red-400",
    },
    { label: t("roi.multiple"), value: `${formatNumber(projection.returnMultiple, { maximumFractionDigits: 2 })}×` },
    {
      label: t("roi.payback"),
      value: projection.paybackYear ? t("roi.paybackYear", { year: projection.paybackYear }) : t("roi.paybackNever"),
    },
  ];

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className={cn("rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-5", className)}
      data-testid="backer-roi-calculator"
    >
      <header className="space-y-1">
        <h3 id={`${ids}-title`} className="flex items-center gap-2 text-lg font-bold text-zinc-100">
          <Calculator aria-hidden="true" className="h-5 w-5 text-emerald-400" /> {t("roi.title")}
        </h3>
        <p className="text-sm text-zinc-400">
          {t("roi.subtitle", {
            percent: formatNumber(terms.revenueSharePercent, { maximumFractionDigits: 2 }),
            years: terms.termYears,
          })}
        </p>
      </header>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={`${ids}-pledge`} className="text-sm font-medium text-zinc-300">
            {t("roi.pledgeAmount")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              aria-label={t("roi.pledgeAmount")}
              min={range.min}
              max={range.max}
              step={range.step}
              value={pledge}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) setPledge(Math.min(Math.max(next, 0), range.max));
              }}
              className="w-32 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-end text-sm text-white tabular-nums focus:border-emerald-500 focus:outline-none"
            />
            <span className="text-xs text-zinc-400">{terms.currency}</span>
          </div>
        </div>
        <input
          id={`${ids}-pledge`}
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={pledge}
          onChange={(e) => setPledge(Number(e.target.value))}
          aria-valuetext={money(pledge)}
          className="w-full accent-emerald-500"
        />
        <div className="flex justify-between text-xs text-zinc-500 tabular-nums">
          <span>{money(range.min)}</span>
          <span>{money(range.max)}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-live="polite">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <dt className="text-xs text-zinc-400">{stat.label}</dt>
            <dd className={cn("mt-1 text-base font-semibold tabular-nums text-zinc-100", stat.tone)}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      {projection.years.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-zinc-300 hover:text-white">
            {t("roi.yearlyBreakdown")}
          </summary>
          <ol className="mt-3 max-h-64 space-y-1.5 overflow-y-auto pe-1">
            {projection.years.map((year) => (
              <li key={year.year} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
                <span className="text-zinc-400">{t("roi.yearLabel", { year: year.year })}</span>
                <span className="h-2 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${maxPayout > 0 ? (year.payout / maxPayout) * 100 : 0}%` }}
                  />
                </span>
                <span className="tabular-nums text-zinc-200">{money(year.payout)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}

      <p
        role="note"
        className="flex gap-2 rounded-lg border border-amber-600/30 bg-amber-950/30 p-3 text-xs leading-relaxed text-amber-200"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-amber-400" />
        <span>{t("roi.disclaimer")}</span>
      </p>
    </section>
  );
}
