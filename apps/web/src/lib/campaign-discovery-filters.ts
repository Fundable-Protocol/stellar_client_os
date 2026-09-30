export const DISCOVERY_TREE_SPECIES = ["Oak", "Pine", "Mangrove"] as const;
export const DISCOVERY_REGIONS = ["North America", "Africa", "Asia"] as const;

export type DiscoveryTreeSpecies = (typeof DISCOVERY_TREE_SPECIES)[number];
export type DiscoveryRegion = (typeof DISCOVERY_REGIONS)[number];

export interface CampaignDiscoveryRecord {
  treeSpecies?: string;
  region?: string;
  location?: string;
  gpsLocations?: Array<{ latitude: number; longitude: number }>;
}

export interface CampaignDiscoveryFilters {
  treeSpecies: DiscoveryTreeSpecies | "All";
  region: DiscoveryRegion | "All";
}

const REGION_LOCATION_TERMS: Record<DiscoveryRegion, string[]> = {
  "North America": [
    "north america", "united states", "usa", "u.s.a.", "canada", "mexico", "greenland",
    "guatemala", "belize", "honduras", "el salvador", "nicaragua", "costa rica", "panama",
    "cuba", "jamaica", "haiti", "dominican republic", "puerto rico",
  ],
  Africa: [
    "africa", "algeria", "angola", "benin", "botswana", "burkina faso", "burundi", "cameroon",
    "chad", "congo", "djibouti", "egypt", "eritrea", "ethiopia", "ghana", "ivory coast",
    "kenya", "madagascar", "malawi", "mali", "mauritania", "mauritius", "morocco", "mozambique",
    "namibia", "niger", "nigeria", "rwanda", "senegal", "somalia", "south africa", "sudan",
    "tanzania", "togo", "tunisia", "uganda", "zambia", "zimbabwe",
  ],
  Asia: [
    "asia", "afghanistan", "armenia", "azerbaijan", "bahrain", "bangladesh", "bhutan", "brunei",
    "cambodia", "china", "cyprus", "georgia", "india", "indonesia", "iran", "iraq", "israel",
    "japan", "jordan", "kazakhstan", "kuwait", "kyrgyzstan", "laos", "lebanon", "malaysia",
    "maldives", "mongolia", "myanmar", "nepal", "north korea", "oman", "pakistan", "palestine",
    "philippines", "qatar", "saudi arabia", "singapore", "south korea", "sri lanka", "syria",
    "taiwan", "tajikistan", "thailand", "timor-leste", "turkey", "turkmenistan", "united arab emirates",
    "uzbekistan", "vietnam", "yemen",
  ],
};

function regionFromCoordinates(latitude: number, longitude: number): DiscoveryRegion | undefined {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude >= 7 && latitude <= 84 && longitude >= -170 && longitude <= -50) return "North America";
  if (latitude >= -35 && latitude <= 37 && longitude >= -18 && longitude <= 52) return "Africa";
  if (latitude >= -10 && latitude <= 80 && longitude >= 25 && longitude <= 180) return "Asia";
  return undefined;
}

export function getCampaignDiscoveryRegion(campaign: CampaignDiscoveryRecord): DiscoveryRegion | undefined {
  const explicitRegion = DISCOVERY_REGIONS.find(
    (region) => campaign.region?.trim().toLowerCase() === region.toLowerCase(),
  );
  if (explicitRegion) return explicitRegion;

  for (const point of campaign.gpsLocations ?? []) {
    const region = regionFromCoordinates(point.latitude, point.longitude);
    if (region) return region;
  }

  const location = campaign.location?.toLowerCase();
  if (!location) return undefined;
  return DISCOVERY_REGIONS.find((region) =>
    REGION_LOCATION_TERMS[region].some((term) => location.includes(term)),
  );
}

function campaignHasSpecies(campaign: CampaignDiscoveryRecord, selected: DiscoveryTreeSpecies): boolean {
  return (campaign.treeSpecies ?? "")
    .split(/[,;/|]/)
    .map((species) => species.trim().toLowerCase().replace(/\s+trees?$/, "").replace(/s$/, ""))
    .includes(selected.toLowerCase().replace(/s$/, ""));
}

export function filterCampaignsByDiscoveryOptions<T extends CampaignDiscoveryRecord>(
  campaigns: T[],
  filters: CampaignDiscoveryFilters,
): T[] {
  return campaigns.filter((campaign) => {
    const matchesSpecies = filters.treeSpecies === "All" || campaignHasSpecies(campaign, filters.treeSpecies);
    const matchesRegion = filters.region === "All" || getCampaignDiscoveryRegion(campaign) === filters.region;
    return matchesSpecies && matchesRegion;
  });
}
