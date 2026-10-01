"use client";

import { FundableMap } from "./FundableMap";
import type { FundableStream } from "./types";

export type PlantingSite = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  location: string;
  treesPlanted: number;
  treeType: string;
  creator: string;
};

const ACTIVE_PLANTING_SITES: PlantingSite[] = [
  { id: "amazon", title: "Amazon Rainforest Reserve", latitude: -3.4653, longitude: -62.2159, location: "Amazon Basin, Brazil", treesPlanted: 1500, treeType: "Mangrove", creator: "GD6W...X892" },
  { id: "kenya", title: "Mida Creek Mangrove Recovery", latitude: -3.299, longitude: 40.015, location: "Mida Creek, Kenya", treesPlanted: 840, treeType: "Mangrove", creator: "GBAK...K31" },
  { id: "mexico", title: "Baja Native Woodland", latitude: 24.1426, longitude: -110.3128, location: "Baja California Sur, Mexico", treesPlanted: 620, treeType: "Oak", creator: "GDRT...P72" },
  { id: "borneo", title: "Borneo Habitat Corridor", latitude: 1.4927, longitude: 110.3478, location: "Sarawak, Malaysia", treesPlanted: 1100, treeType: "Acacia", creator: "GBOR...Q19" },
];

function toStream(site: PlantingSite): FundableStream {
  return {
    id: site.id,
    title: site.title,
    description: `${site.treesPlanted.toLocaleString()} ${site.treeType} trees planted in ${site.location}.`,
    location: { lat: site.latitude, lng: site.longitude },
    amount: `${site.treesPlanted.toLocaleString()} trees`,
    currency: site.treeType,
    status: "active",
    creator: site.creator,
    category: site.location,
  };
}

export function CampaignPlantingSitesMap({ sites = ACTIVE_PLANTING_SITES }: { sites?: PlantingSite[] }) {
  const streams = sites.map(toStream);
  return (
    <section aria-labelledby="planting-sites-heading" className="space-y-3">
      <div>
        <h2 id="planting-sites-heading" className="text-xl font-bold text-zinc-100">Active planting sites</h2>
        <p className="text-sm text-zinc-400">Explore active campaigns globally. Select a site to review its tree count and species.</p>
      </div>
      <FundableMap streams={streams} className="min-h-[420px]" />
      <p className="text-xs text-zinc-500">Map data reflects active planting locations with coordinates supplied by campaign creators.</p>
    </section>
  );
}

export default CampaignPlantingSitesMap;
