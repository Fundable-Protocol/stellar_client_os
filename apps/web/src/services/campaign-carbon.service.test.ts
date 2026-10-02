import { describe, it, expect } from 'vitest';
import { CampaignCarbonService } from './campaign-carbon.service';

describe('CampaignCarbonService', () => {
  it('correctly maps 1 carbon credit token to 1 tonne CO2 equivalent', () => {
    const summary = CampaignCarbonService.getPortfolioSummary(845, BigInt(250), true);
    expect(summary.tokensMinted).toBe(BigInt(250));
    expect(summary.tonnesCo2Offset).toBe(250);
    expect(summary.canTrade).toBe(true);
  });

  it('prohibits trading when tokens are not yet minted', () => {
    const summary = CampaignCarbonService.getPortfolioSummary(845, BigInt(250), false);
    expect(summary.canTrade).toBe(false);
  });
});
