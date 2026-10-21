import { notFound } from "next/navigation";
import { getCampaign } from "@/services/campaign.service";
import { BackerSurveyResponseForm } from "@/components/modules/campaign/survey/BackerSurveyResponseForm";

export const runtime = "nodejs";

export default async function CampaignSurveyPage({
  params,
}: {
  params: Promise<{ id: string; surveyId: string }>;
}) {
  const { id, surveyId } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <BackerSurveyResponseForm campaignId={id} surveyId={surveyId} />
    </main>
  );
}
