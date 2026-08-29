import React from "react";
import CampaignSearch from "@/components/modules/campaigns/CampaignSearch";

export const metadata = {
  title: "Campaign Search & Filters | Stellar Client OS",
  description: "Search and filter active tree funding campaigns by status, tree species, or progress level.",
};

export default function CampaignsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <CampaignSearch />
    </div>
  );
}
