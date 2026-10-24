/**
 * Campaign SEO Service (#1222)
 *
 * Stores creator-authored overrides for the campaign page title tag, meta
 * description and Open Graph image. Only the campaign creator may change them.
 */

import {
  validateCampaignSeo,
  type CampaignSeoInput,
  type CampaignSeoSettings,
} from "@/lib/campaign-seo";
import { getCampaign } from "./campaign.service";

export type CampaignSeoErrorCode = "INVALID_INPUT" | "CAMPAIGN_NOT_FOUND" | "NOT_AUTHORIZED";

export class CampaignSeoError extends Error {
  constructor(
    public readonly code: CampaignSeoErrorCode,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "CampaignSeoError";
  }
}

export interface StoredCampaignSeo extends CampaignSeoSettings {
  campaignId: string;
  updatedAt: number;
  updatedBy: string;
}

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export class CampaignSeoService {
  constructor(private readonly settings = new Map<string, StoredCampaignSeo>()) {}

  getSeo(campaignId: string): StoredCampaignSeo | null {
    return this.settings.get(campaignId) ?? null;
  }

  async saveSeo(params: {
    campaignId: string;
    callerAddress?: string;
    input: CampaignSeoInput;
  }): Promise<StoredCampaignSeo> {
    const { campaignId, callerAddress, input } = params;
    if (!callerAddress?.trim()) {
      throw new CampaignSeoError("INVALID_INPUT", "callerAddress is required");
    }

    const campaign = await getCampaign(campaignId);
    if (!campaign) throw new CampaignSeoError("CAMPAIGN_NOT_FOUND", "Campaign not found");
    if (!same(campaign.creator, callerAddress)) {
      throw new CampaignSeoError("NOT_AUTHORIZED", "Only the campaign creator can edit SEO settings");
    }

    const result = validateCampaignSeo(input);
    if (!result.ok) {
      throw new CampaignSeoError("INVALID_INPUT", "Invalid SEO settings", result.errors);
    }

    const stored: StoredCampaignSeo = {
      ...result.value,
      campaignId,
      updatedAt: Date.now(),
      updatedBy: callerAddress.trim(),
    };
    this.settings.set(campaignId, stored);
    return stored;
  }
}

// Route handlers and page metadata are bundled separately by Next.js; keep a
// single store on globalThis so both read the same settings.
const globalStore = globalThis as typeof globalThis & {
  __fundableCampaignSeo?: Map<string, StoredCampaignSeo>;
};
globalStore.__fundableCampaignSeo ??= new Map();

export const campaignSeoService = new CampaignSeoService(globalStore.__fundableCampaignSeo);
