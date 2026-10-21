import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";

export class StaffPickError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "CAMPAIGN_NOT_FOUND", message: string) {
    super(message);
    this.name = "StaffPickError";
  }
}

export interface SetStaffPickInput {
  reason?: string;
  pickedBy?: string;
}

/**
 * Returns all campaigns curated as Staff Picks.
 */
export async function getStaffPicks(
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<CampaignRecord[]> {
  const campaigns = await dataSource.getCampaigns();
  return campaigns.filter((campaign) => Boolean(campaign.isStaffPick));
}

/**
 * Marks a campaign as a Staff Pick. Editorial/admin only.
 */
export async function addStaffPick(
  campaignId: string,
  input: SetStaffPickInput = {},
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignRecord> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) {
    throw new StaffPickError("CAMPAIGN_NOT_FOUND", "Campaign not found");
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const updatedCampaign: CampaignRecord = {
    ...campaign,
    isStaffPick: true,
    staffPickReason: reason || "Featured by the editorial team",
    staffPickedAt: now,
    updatedAt: now,
  };

  return dataSource.saveCampaign(updatedCampaign);
}

/**
 * Removes the Staff Pick designation from a campaign.
 */
export async function removeStaffPick(
  campaignId: string,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignRecord> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) {
    throw new StaffPickError("CAMPAIGN_NOT_FOUND", "Campaign not found");
  }

  const updatedCampaign: CampaignRecord = {
    ...campaign,
    isStaffPick: false,
    staffPickReason: undefined,
    staffPickedAt: undefined,
    updatedAt: now,
  };

  return dataSource.saveCampaign(updatedCampaign);
}
