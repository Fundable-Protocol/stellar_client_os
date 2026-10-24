import { CampaignRecommendationPreferencesForm } from "@/components/campaign/CampaignRecommendationPreferencesForm";

export const metadata = {
  title: "Campaign Recommendation Preferences | Fundable",
  description: "Tune campaign recommendations to your environmental interests.",
};

export default function RecommendationSettingsPage() {
  return <CampaignRecommendationPreferencesForm />;
}
