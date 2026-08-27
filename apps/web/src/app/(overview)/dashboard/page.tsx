import StatsOverview from "@/components/modules/dashboard/StatsOverview";
import DashboardOverview from "@/components/modules/dashboard/DashboardOverview";
import FeatureCards from "@/components/modules/dashboard/FeatureCards";
import { ImpactMapSection } from "@/components/modules/impact-map/ImpactMapSection";
import { TreeMilestoneTimeline } from "@/components/modules/dashboard/TreeMilestoneTimeline";

const DashboardPage = async () => {
    return (
        <main className="h-full overflow-y-auto space-y-4 md:space-y-12 py-10">
            <StatsOverview />
            <DashboardOverview />
            <TreeMilestoneTimeline />
            <FeatureCards />
            <ImpactMapSection />
        </main>
    );
};

export default DashboardPage;
