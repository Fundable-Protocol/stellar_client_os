"use client";

import { CreatorWebhookSettings } from "@/components/modules/settings/CreatorWebhookSettings";
import { useWallet } from "@/providers/StellarWalletProvider";
import { useTranslation } from "@/i18n/I18nProvider";

export default function WebhookSettingsPage() {
  const { address } = useWallet();
  const { t } = useTranslation();

  return (
    <main className="pb-8 md:pb-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">{t("settings.webhooks.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("settings.webhooks.description")}</p>
        </header>
        {address ? (
          <CreatorWebhookSettings key={address} creatorAddress={address} />
        ) : (
          <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">{t("common.connectWalletPrompt")}</p>
        )}
      </div>
    </main>
  );
}
