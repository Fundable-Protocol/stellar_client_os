import StatsOverview from "@/components/modules/dashboard/StatsOverview";
import FeatureCards from "@/components/modules/dashboard/FeatureCards";
import { FunnelVisualization } from "@/components/modules/dashboard/FunnelVisualization";

const DashboardPage = async () => {
    return (
        <main className="h-full overflow-y-auto space-y-4 md:space-y-12 py-10">
            <StatsOverview />
            <FeatureCards />
            <FunnelVisualization />
        </main>
    );
};

export default DashboardPage;
