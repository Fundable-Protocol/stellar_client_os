"use client";

import { useState } from "react";
import { useWallet } from "@/providers/StellarWalletProvider";
import { useTranslation } from "@/i18n/I18nProvider";

type ReportRole = "creator" | "backer";
type ReportFormat = "csv" | "pdf";

function reportUrl(wallet: string, year: number, role: ReportRole, format: ReportFormat): string {
  const params = new URLSearchParams({
    wallet,
    year: String(year),
    role,
    format,
  });
  return `/api/tax/compliance-report?${params.toString()}`;
}

export default function TaxReportsSettingsPage() {
  const { address } = useWallet();
  const { t } = useTranslation();
  const [taxYear, setTaxYear] = useState(new Date().getUTCFullYear() - 1);
  const [role, setRole] = useState<ReportRole>("backer");

  return (
    <main className="pb-8 md:pb-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">{t("settings.taxReports.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("settings.taxReports.description")}</p>
        </header>
        {address ? (
          <>
            <section className="space-y-4 rounded-xl border border-zinc-800 p-5">
              <div>
                <label htmlFor="tax-report-year" className="mb-2 block text-sm font-medium">
                  {t("settings.taxReports.year")}
                </label>
                <select
                  id="tax-report-year"
                  value={taxYear}
                  onChange={(event) => setTaxYear(Number(event.target.value))}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                >
                  {Array.from({ length: 10 }, (_, index) => new Date().getUTCFullYear() - index).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">{t("settings.taxReports.role")}</legend>
                <div className="flex gap-2">
                  {(["backer", "creator"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={role === option}
                      onClick={() => setRole(option)}
                      className={`rounded-full border px-4 py-2 text-sm ${
                        role === option
                          ? "border-purple-500 bg-purple-950/40 text-white"
                          : "border-zinc-700 text-zinc-400 hover:text-white"
                      }`}
                    >
                      {t(option === "creator" ? "settings.taxReports.creator" : "settings.taxReports.backer")}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-3">
                {(["csv", "pdf"] as const).map((format) => (
                  <a
                    key={format}
                    href={reportUrl(address, taxYear, role, format)}
                    className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
                  >
                    {t(format === "csv" ? "settings.taxReports.downloadCSV" : "settings.taxReports.downloadPDF")}
                  </a>
                ))}
              </div>
            </section>
            <p className="text-xs leading-relaxed text-zinc-400">{t("settings.taxReports.ledgerNotice")}</p>
          </>
        ) : (
          <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
            {t("common.connectWalletPrompt")}
          </p>
        )}
      </div>
    </main>
  );
}
