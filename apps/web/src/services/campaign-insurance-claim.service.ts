export class CampaignInsuranceClaimService {
  async submitClaim(): Promise<{ ok: true }> {
    return { ok: true };
  }

  async getClaims(): Promise<unknown[]> {
    return [];
  }
}

export const campaignInsuranceClaimService = new CampaignInsuranceClaimService();
