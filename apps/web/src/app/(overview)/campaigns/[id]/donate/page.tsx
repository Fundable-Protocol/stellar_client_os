"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Recycle } from "lucide-react";

import { CarbonTradingPanel } from "@/components/modules/campaign/carbon/CarbonTradingPanel";
import { CampaignDonationPanel } from "@/components/modules/campaign/donation/CampaignDonationPanel";
import { CampaignWaitlistPanel } from "@/components/modules/campaign/waitlist/CampaignWaitlistPanel";
import { useTranslation } from "@/i18n/I18nProvider";

/**
 * One-time charitable donation page (issue #1001).
 *
 * Unlike the tree-selection sponsorship flow, a donation here is handed to the
 * campaign creator's discretion so it can be spent on project costs.
 *
 * This page also exposes the secondary market for trading carbon credits
 * earned from campaigns, where sponsors can sell earned credits to other
 * participants.
 *
 * For campaigns that have not yet launched, this page shows a coming soon
 * teaser and a waitlist email capture form instead of the donation flow.
 */
export default function CampaignDonatePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const campaignId = String(id);

  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <Link
        href={`/campaigns/${campaignId}`}
        className="inline-flex items-center text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="me-1 h-3.5 w-3.5 rtl:rotate-180" /> {t("pledge.backToCampaign")}
      </Link>

      <header className="mt-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">{t("pledge.pageTitle")}</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          {t("pledge.pageDescription")}
        </p>
      </header>

      <div className="mt-8">
        <CampaignDonationPanel campaignId={campaignId} />
      </div>

      <section className="mt-12 border-t border-zinc-800 pt-10">
        <div className="flex items-center gap-2">
          <Recycle className="h-5 w-5 text-emerald-400" />
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Carbon credit secondary market
          </h2>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Sponsors can list carbon credits earned from this campaign and trade them
          with other participants. Browse open listings or sell your own credits.
        </p>
        <div className="mt-6">
          <CarbonTradingPanel campaignId={campaignId} />
        </div>
      </section>

      <div className="mt-8">
        <CampaignWaitlistPanel campaignId={campaignId} />
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
