"use client";

import { use } from "react";
import { ThankYouPageEditor } from "@/components/modules/campaign/thank-you/ThankYouPageEditor";

export default function CampaignThankYouSettingsPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  return <ThankYouPageEditor campaignId={campaignId} />;
}
