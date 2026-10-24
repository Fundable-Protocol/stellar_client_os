import { safeGetItem, safeSetItem } from "@/utils/safe-storage";

export interface CampaignRecommendationPreferences {
  species: string[];
  geographicInterests: string[];
  environmentalCauses: string[];
}

export const EMPTY_CAMPAIGN_RECOMMENDATION_PREFERENCES: CampaignRecommendationPreferences = {
  species: [],
  geographicInterests: [],
  environmentalCauses: [],
};

const MAX_VIEWED_CAMPAIGNS = 30;

function storageKey(address: string, key: string): string {
  return `fundable:campaign-recommendations:${address.trim().toUpperCase()}:${key}`;
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function readCampaignRecommendationPreferences(
  address: string
): CampaignRecommendationPreferences {
  const key = storageKey(address, "preferences");
  const value = safeGetItem(key);
  if (!value) return EMPTY_CAMPAIGN_RECOMMENDATION_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return EMPTY_CAMPAIGN_RECOMMENDATION_PREFERENCES;
    const record = parsed as Record<string, unknown>;
    const values = (field: unknown) =>
      Array.isArray(field) ? field.filter((item): item is string => typeof item === "string") : [];
    return {
      species: values(record.species),
      geographicInterests: values(record.geographicInterests),
      environmentalCauses: values(record.environmentalCauses),
    };
  } catch {
    return EMPTY_CAMPAIGN_RECOMMENDATION_PREFERENCES;
  }
}

export function saveCampaignRecommendationPreferences(
  address: string,
  preferences: CampaignRecommendationPreferences
): boolean {
  return safeSetItem(storageKey(address, "preferences"), JSON.stringify(preferences));
}

export function readViewedCampaignIds(address: string): string[] {
  return parseStringArray(safeGetItem(storageKey(address, "viewed")));
}

export function recordCampaignView(address: string, campaignId: string): void {
  const viewed = readViewedCampaignIds(address).filter((id) => id !== campaignId);
  safeSetItem(
    storageKey(address, "viewed"),
    JSON.stringify([campaignId, ...viewed].slice(0, MAX_VIEWED_CAMPAIGNS))
  );
}
