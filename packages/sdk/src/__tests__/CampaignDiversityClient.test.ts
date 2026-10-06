import { describe, it, expect } from 'vitest';
import { CampaignDiversityClient } from '../CampaignDiversityClient';

describe('CampaignDiversityClient', () => {
  it('returns 0 for empty species list', () => {
    expect(CampaignDiversityClient.calculateScore([])).toBe(0);
  });

  it('calculates low score for monoculture', () => {
    const score = CampaignDiversityClient.calculateScore([{ speciesCode: 'oak', count: 1000 }]);
    expect(score).toBeLessThan(1000);
    expect(CampaignDiversityClient.isCarbonCreditEligible(score, 1000)).toBe(false);
  });

  it('calculates high score for polyculture', () => {
    const diverse = [
      { speciesCode: 'oak', count: 250 },
      { speciesCode: 'pine', count: 250 },
      { speciesCode: 'birch', count: 250 },
      { speciesCode: 'maple', count: 250 },
    ];
    const score = CampaignDiversityClient.calculateScore(diverse);
    expect(score).toBeGreaterThan(4000);
    expect(CampaignDiversityClient.isCarbonCreditEligible(score, 1000)).toBe(true);
  });
});
