import StatsOverview from "@/components/modules/dashboard/StatsOverview";
import CreatorStatsDashboard from "@/components/modules/dashboard/CreatorStatsDashboard";
import DashboardOverview from "@/components/modules/dashboard/DashboardOverview";
import FeatureCards from "@/components/modules/dashboard/FeatureCards";
import ImpactComparison from "@/components/modules/dashboard/ImpactComparison";
import { ImpactMapSection } from "@/components/modules/impact-map/ImpactMapSection";
import { TreeMilestoneTimeline } from "@/components/modules/dashboard/TreeMilestoneTimeline";
import ForestReportExport from "@/components/modules/dashboard/ForestReportExport";
import { CampaignImpactCalculator } from "@/components/modules/impact/CampaignImpactCalculator";
import CampaignCreatorBadge from "@/components/modules/dashboard/CampaignCreatorBadge";
import MentorshipPanel from "@/components/modules/dashboard/MentorshipPanel";
import { CO2SequestrationProjection } from "@/components/modules/dashboard/CO2SequestrationProjection";
import { StaffPicksSection } from "@/components/modules/campaign/StaffPicksSection";
import { BackerNotificationPreferencePanel } from "@/components/modules/dashboard/BackerNotificationPreferencePanel";
import { BackerSubscriptionsManager } from "@/components/modules/dashboard/BackerSubscriptionsManager";

const DashboardPage = async () => {
    return (
        <main className="h-full overflow-y-auto space-y-4 md:space-y-12 py-10">
            <StatsOverview />
            <BackerSubscriptionsManager />
            <BackerNotificationPreferencePanel />
            <StaffPicksSection />
            <CreatorStatsDashboard />
            <CampaignCreatorBadge />
            <MentorshipPanel />
            <ForestReportExport />
            <DashboardOverview />
            <TreeMilestoneTimeline />
            <FeatureCards />
            <CampaignImpactCalculator />
            <CO2SequestrationProjection />
            <ImpactMapSection />
        </main>
    );
};

export default DashboardPage;
