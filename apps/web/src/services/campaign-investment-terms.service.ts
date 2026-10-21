/**
 * Campaign Investment Terms Service (#1244)
 *
 * Holds the revenue-sharing terms a creator publishes for an investment-type
 * campaign. Backers read them to drive the ROI calculator on the campaign page.
 */

import { validateInvestmentTerms, type CampaignInvestmentTerms } from "@/lib/backer-roi";
import { getCampaign } from "./campaign.service";

export type InvestmentTermsErrorCode = "INVALID_INPUT" | "CAMPAIGN_NOT_FOUND" | "NOT_AUTHORIZED";

export class InvestmentTermsError extends Error {
  constructor(
    public readonly code: InvestmentTermsErrorCode,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "InvestmentTermsError";
  }
}

export interface StoredInvestmentTerms extends CampaignInvestmentTerms {
  campaignId: string;
  updatedAt: number;
}

const same = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

export class CampaignInvestmentTermsService {
  constructor(private readonly terms = new Map<string, StoredInvestmentTerms>()) {}

  getTerms(campaignId: string): StoredInvestmentTerms | null {
    return this.terms.get(campaignId) ?? null;
  }

  private async assertCreator(campaignId: string, callerAddress?: string): Promise<void> {
    if (!callerAddress?.trim()) {
      throw new InvestmentTermsError("INVALID_INPUT", "callerAddress is required");
    }
    const campaign = await getCampaign(campaignId);
    if (!campaign) throw new InvestmentTermsError("CAMPAIGN_NOT_FOUND", "Campaign not found");
    if (!same(campaign.creator, callerAddress)) {
      throw new InvestmentTermsError("NOT_AUTHORIZED", "Only the campaign creator can set investment terms");
    }
  }

  async saveTerms(params: {
    campaignId: string;
    callerAddress?: string;
    input: Record<string, unknown>;
  }): Promise<StoredInvestmentTerms> {
    await this.assertCreator(params.campaignId, params.callerAddress);
    const result = validateInvestmentTerms(params.input);
    if (!result.ok) {
      throw new InvestmentTermsError("INVALID_INPUT", "Invalid investment terms", result.errors);
    }
    const stored: StoredInvestmentTerms = { ...result.value, campaignId: params.campaignId, updatedAt: Date.now() };
    this.terms.set(params.campaignId, stored);
    return stored;
  }

  /** Remove terms, turning the campaign back into a non-investment campaign. */
  async clearTerms(params: { campaignId: string; callerAddress?: string }): Promise<boolean> {
    await this.assertCreator(params.campaignId, params.callerAddress);
    return this.terms.delete(params.campaignId);
  }
}

const globalStore = globalThis as typeof globalThis & {
  __fundableInvestmentTerms?: Map<string, StoredInvestmentTerms>;
};
globalStore.__fundableInvestmentTerms ??= new Map();

export const campaignInvestmentTermsService = new CampaignInvestmentTermsService(globalStore.__fundableInvestmentTerms);
