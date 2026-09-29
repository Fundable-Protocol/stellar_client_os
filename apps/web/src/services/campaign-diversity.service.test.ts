import { describe, it, expect } from 'vitest';
import { CampaignDiversityService } from './campaign-diversity.service';

describe('CampaignDiversityService', () => {
  it('correctly assesses single species monoculture', () => {
    const assessment = CampaignDiversityService.assessDiversity([
      { name: 'Teak', code: 'TEAK', count: 500 }
    ]);
    expect(assessment.rating).toBe('Monoculture');
    expect(assessment.carbonCreditEligible).toBe(false);
  });

  it('correctly assesses balanced polyculture', () => {
    const assessment = CampaignDiversityService.assessDiversity([
      { name: 'Teak', code: 'TEAK', count: 300 },
      { name: 'Mahogany', code: 'MAHO', count: 300 },
      { name: 'Cedar', code: 'CEDR', count: 300 },
      { name: 'Baobab', code: 'BAOB', count: 300 },
    ]);
    expect(assessment.scoreBps).toBeGreaterThanOrEqual(5000);
    expect(assessment.carbonCreditEligible).toBe(true);
  });
});
