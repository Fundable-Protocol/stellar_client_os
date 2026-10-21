import {
  getCampaign,
  getCampaignDataSource,
  type CampaignCharityBadge,
  type CampaignDataSource,
  type CampaignRecord,
  type CharityBadgeType,
} from "./campaign.service";

export const CHARITY_BADGE_TYPES: readonly CharityBadgeType[] = ["TAX_EXEMPT", "CHARITY_VERIFIED"];

export class CharityBadgeError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "CAMPAIGN_NOT_FOUND", message: string) {
    super(message);
    this.name = "CharityBadgeError";
  }
}

export function isCharityBadgeType(value: unknown): value is CharityBadgeType {
  return typeof value === "string" && (CHARITY_BADGE_TYPES as readonly string[]).includes(value);
}

/** Documentation links are shown to backers, so only absolute http(s) URLs are accepted. */
function normalizeDocumentationUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CharityBadgeError("INVALID_INPUT", "documentationUrl is required");
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new CharityBadgeError("INVALID_INPUT", "documentationUrl must be a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CharityBadgeError("INVALID_INPUT", "documentationUrl must use http or https");
  }
  return url.toString();
}

/** Awards (or replaces) the charity badge on a campaign. Admin-only; callers must authorize first. */
export async function awardCharityBadge(
  campaignId: string,
  input: { type: unknown; documentationUrl: unknown; awardedBy: string },
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignRecord> {
  if (!isCharityBadgeType(input.type)) {
    throw new CharityBadgeError("INVALID_INPUT", `type must be one of ${CHARITY_BADGE_TYPES.join(", ")}`);
  }
  if (!input.awardedBy.trim()) throw new CharityBadgeError("INVALID_INPUT", "awardedBy is required");
  const documentationUrl = normalizeDocumentationUrl(input.documentationUrl);

  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new CharityBadgeError("CAMPAIGN_NOT_FOUND", "Campaign not found");

  const charityBadge: CampaignCharityBadge = {
    type: input.type,
    documentationUrl,
    awardedBy: input.awardedBy.trim(),
    awardedAt: now,
  };
  return dataSource.saveCampaign({ ...campaign, charityBadge, updatedAt: now });
}

/** Removes the charity badge from a campaign. */
export async function revokeCharityBadge(
  campaignId: string,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignRecord> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new CharityBadgeError("CAMPAIGN_NOT_FOUND", "Campaign not found");
  const { charityBadge: _removed, ...rest } = campaign;
  return dataSource.saveCampaign({ ...rest, updatedAt: now });
}
