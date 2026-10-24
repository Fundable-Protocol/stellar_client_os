"use client";

import { useEffect, useId, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  INVESTMENT_MODELS,
  validateInvestmentTerms,
  type CampaignInvestmentTerms,
  type InvestmentModel,
} from "@/lib/backer-roi";
import { useTranslation } from "@/i18n/I18nProvider";
import { useWallet } from "@/providers/StellarWalletProvider";
import type { MessageKey } from "@/i18n/translate";
import { cn } from "@/lib/utils";

type FieldName = Exclude<keyof CampaignInvestmentTerms, "model">;

const NUMBER_FIELDS: { name: FieldName; label: MessageKey; step: string; optional?: boolean }[] = [
  { name: "revenueSharePercent", label: "roi.terms.revenueSharePercent", step: "0.01" },
  { name: "projectedAnnualRevenue", label: "roi.terms.projectedAnnualRevenue", step: "any" },
  { name: "fundingGoal", label: "roi.terms.fundingGoal", step: "any" },
  { name: "termYears", label: "roi.terms.termYears", step: "1" },
  { name: "annualGrowthPercent", label: "roi.terms.annualGrowthPercent", step: "0.1", optional: true },
  { name: "minPledge", label: "roi.terms.minPledge", step: "any", optional: true },
  { name: "maxPledge", label: "roi.terms.maxPledge", step: "any", optional: true },
];

type FormState = Record<FieldName, string> & { model: InvestmentModel };

const EMPTY: FormState = {
  model: "revenue_share",
  revenueSharePercent: "",
  projectedAnnualRevenue: "",
  fundingGoal: "",
  termYears: "5",
  annualGrowthPercent: "0",
  currency: "USDC",
  minPledge: "",
  maxPledge: "",
};

/**
 * Creator inputs for investment-type campaigns (#1244): revenue share %,
 * projected annual revenue and term. Saved terms power the backer calculator.
 */
export function InvestmentTermsForm({ campaignId, defaultFundingGoal }: { campaignId: string | number; defaultFundingGoal?: string }) {
  const { t } = useTranslation();
  const { address } = useWallet();
  const ids = useId();
  const [form, setForm] = useState<FormState>({ ...EMPTY, fundingGoal: defaultFundingGoal ?? "" });
  const [errors, setErrors] = useState<Partial<Record<keyof CampaignInvestmentTerms, string>>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/campaigns/${campaignId}/investment-terms`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { terms?: CampaignInvestmentTerms | null } | null) => {
        const terms = data?.terms;
        if (cancelled || !terms) return;
        setForm({
          model: terms.model,
          revenueSharePercent: String(terms.revenueSharePercent),
          projectedAnnualRevenue: String(terms.projectedAnnualRevenue),
          fundingGoal: String(terms.fundingGoal),
          termYears: String(terms.termYears),
          annualGrowthPercent: String(terms.annualGrowthPercent),
          currency: terms.currency,
          minPledge: terms.minPledge !== undefined ? String(terms.minPledge) : "",
          maxPledge: terms.maxPledge !== undefined ? String(terms.maxPledge) : "",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const handleSave = async () => {
    setFeedback(null);
    const validation = validateInvestmentTerms(form);
    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    if (!address) {
      setFeedback({ type: "error", message: t("common.connectWalletPrompt") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/investment-terms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callerAddress: address, ...validation.value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; details?: typeof errors };
      if (!res.ok) {
        if (data.details) setErrors(data.details);
        throw new Error(data.error || t("common.somethingWentWrong"));
      }
      setFeedback({ type: "success", message: t("roi.terms.saved") });
    } catch (err) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : t("common.somethingWentWrong") });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500";

  return (
    <section aria-labelledby={`${ids}-heading`} className="space-y-4">
      <div>
        <h3 id={`${ids}-heading`} className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <TrendingUp aria-hidden="true" className="h-4 w-4 text-emerald-400" /> {t("roi.terms.title")}
        </h3>
        <p className="mt-1 text-xs text-slate-400">{t("roi.terms.description")}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-model`} className="block text-sm font-medium text-slate-300 mb-1">
            {t("roi.terms.type")}
          </label>
          <select
            id={`${ids}-model`}
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value as InvestmentModel }))}
            className={inputClass}
          >
            {INVESTMENT_MODELS.map((model) => (
              <option key={model} value={model}>
                {t(`roi.terms.${model}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-currency`} className="block text-sm font-medium text-slate-300 mb-1">
            {t("roi.terms.currency")}
          </label>
          <input
            id={`${ids}-currency`}
            type="text"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            className={cn(inputClass, "uppercase")}
          />
          {errors.currency && <p className="text-red-400 text-xs mt-1">{errors.currency}</p>}
        </div>

        {NUMBER_FIELDS.map(({ name, label, step, optional }) => (
          <div key={name}>
            <label htmlFor={`${ids}-${name}`} className="block text-sm font-medium text-slate-300 mb-1">
              {t(label)}
              {optional && <span className="ms-1 text-xs font-normal text-slate-500">({t("common.optional")})</span>}
            </label>
            <input
              id={`${ids}-${name}`}
              type="number"
              inputMode="decimal"
              step={step}
              value={form[name]}
              onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
              aria-invalid={Boolean(errors[name])}
              className={cn(inputClass, errors[name] && "border-red-500")}
            />
            {errors[name] && <p className="text-red-400 text-xs mt-1">{errors[name]}</p>}
          </div>
        ))}
      </div>

      {feedback && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={cn("text-sm", feedback.type === "error" ? "text-red-400" : "text-emerald-400")}
        >
          {feedback.message}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </section>
  );
}
