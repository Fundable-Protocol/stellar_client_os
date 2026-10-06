/**
 * Campaign Species Diversity Service
 *
 * Provides web-tier computations, badge generation, and carbon-credit qualification
 * for tree planting species diversity (Issue #855).
 */

export interface TreeSpeciesStat {
  speciesName: string;
  speciesCode: string;
  count: number;
  percentage: number;
}

export interface DiversityAssessment {
  scoreBps: number;
  scorePercentage: number;
  rating: 'Monoculture' | 'Moderate Diversity' | 'High Diversity' | 'Optimal Polyculture';
  carbonCreditEligible: boolean;
  speciesBreakdown: TreeSpeciesStat[];
}

export class CampaignDiversityService {
  static assessDiversity(speciesData: { name: string; code: string; count: number }[]): DiversityAssessment {
    const total = speciesData.reduce((acc, s) => acc + s.count, 0);
    const breakdown: TreeSpeciesStat[] = speciesData.map((s) => ({
      speciesName: s.name,
      speciesCode: s.code,
      count: s.count,
      percentage: total > 0 ? (s.count / total) * 100 : 0,
    }));

    const distinct = speciesData.length;
    const richnessBps = distinct >= 12 ? 5000 : Math.floor((distinct * 5000) / 12);

    let evennessBps = 0;
    if (distinct > 1 && total > 1) {
      const sumSq = speciesData.reduce((acc, s) => acc + s.count * s.count, 0);
      const maxSq = total * total;
      const concentration = Math.floor((sumSq * 5000) / maxSq);
      evennessBps = Math.max(0, 5000 - concentration);
    }

    const scoreBps = Math.min(10000, richnessBps + evennessBps);
    const scorePercentage = scoreBps / 100;

    let rating: DiversityAssessment['rating'] = 'Monoculture';
    if (scoreBps >= 7500) rating = 'Optimal Polyculture';
    else if (scoreBps >= 5000) rating = 'High Diversity';
    else if (scoreBps >= 2000) rating = 'Moderate Diversity';

    const carbonCreditEligible = scoreBps >= 5000 && total >= 1000;

    return {
      scoreBps,
      scorePercentage,
      rating,
      carbonCreditEligible,
      speciesBreakdown: breakdown,
    };
  }
}
