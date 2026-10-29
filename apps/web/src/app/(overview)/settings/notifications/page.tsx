"use client";

import { BackerDigestPreferenceToggle } from "@/components/modules/settings/BackerDigestPreferenceToggle";
import { MobilePushPreferenceSettings } from "@/components/modules/settings/MobilePushPreferenceSettings";
import { useWallet } from "@/providers/StellarWalletProvider";
import { useTranslation } from "@/i18n/I18nProvider";

export default function NotificationSettingsPage() {
  const { address } = useWallet();
  const { t } = useTranslation();

  return (
    <main className="pb-8 md:pb-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">{t("settings.notifications.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("settings.notifications.description")}
          </p>
        </header>
        <BackerDigestPreferenceToggle backerId={address ?? undefined} />
        <MobilePushPreferenceSettings subscriberAddress={address ?? undefined} />
      </div>
    </main>
  );
}
