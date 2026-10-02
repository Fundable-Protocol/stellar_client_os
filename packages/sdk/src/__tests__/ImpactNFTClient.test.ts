import { describe, it, expect } from 'vitest';
import { ImpactNFTClient } from '../ImpactNFTClient';

describe('ImpactNFTClient', () => {
  describe('calculatePersonalImpact', () => {
    it('calculates proportional trees and CO2 correctly for a 50% contribution', () => {
      const result = ImpactNFTClient.calculatePersonalImpact(
        5_000n,
        10_000n,
        1_000,
        20.0
      );

      expect(result.contributionSharePercentage).toBe(50);
      expect(result.personalTrees).toBe(500);
      expect(result.personalCo2Tonnes).toBe(10.0);
    });

    it('calculates proportional impact for a 10% sponsor in a large campaign', () => {
      const result = ImpactNFTClient.calculatePersonalImpact(
        1_000n,
        10_000n,
        5_000,
        100.0
      );

      expect(result.contributionSharePercentage).toBe(10);
      expect(result.personalTrees).toBe(500);
      expect(result.personalCo2Tonnes).toBe(10.0);
    });

    it('returns at least 1 personal tree for a small sponsor when total trees > 0', () => {
      const result = ImpactNFTClient.calculatePersonalImpact(
        1n,
        1_000_000n,
        100,
        2.0
      );

      expect(result.contributionSharePercentage).toBe(0);
      expect(result.personalTrees).toBe(1);
      expect(result.personalCo2Tonnes).toBeGreaterThanOrEqual(0);
    });

    it('returns zero values if contribution or total raised is zero', () => {
      const zeroContrib = ImpactNFTClient.calculatePersonalImpact(0n, 10_000n, 100, 2.0);
      expect(zeroContrib.contributionSharePercentage).toBe(0);
      expect(zeroContrib.personalTrees).toBe(0);
      expect(zeroContrib.personalCo2Tonnes).toBe(0);

      const zeroRaised = ImpactNFTClient.calculatePersonalImpact(500n, 0n, 100, 2.0);
      expect(zeroRaised.contributionSharePercentage).toBe(0);
      expect(zeroRaised.personalTrees).toBe(0);
      expect(zeroRaised.personalCo2Tonnes).toBe(0);
    });
  });

  describe('formatCompletionNFTMetadata', () => {
    it('generates standard metadata including campaign details, trees, CO2, and sponsor count', () => {
      const metadata = ImpactNFTClient.formatCompletionNFTMetadata({
        campaignId: 'camp-101',
        campaignTitle: 'Amazon Rainforest Restoration',
        creatorAddress: 'GB1234567890',
        totalTrees: 5000,
        totalCo2Tonnes: 100.5,
        sponsorCount: 42,
        totalRaised: '50000',
        fundingGoal: '50000',
        completedAt: '2026-09-30T12:00:00Z',
      });

      expect(metadata.name).toBe('Amazon Rainforest Restoration - Official Completion Impact NFT');
      expect(metadata.description).toContain('Amazon Rainforest Restoration');
      expect(metadata.description).toContain('5000 trees');
      expect(metadata.description).toContain('100.5 metric tonnes of CO2');
      expect(metadata.description).toContain('42 community sponsors');
      expect(metadata.properties.totalTrees).toBe(5000);
      expect(metadata.properties.totalCo2Tonnes).toBe(100.5);
      expect(metadata.properties.sponsorCount).toBe(42);
      expect(metadata.properties.nftType).toBe('CAMPAIGN_COMPLETION');

      const traits = metadata.attributes.reduce<Record<string, string | number>>((acc, attr) => {
        acc[attr.trait_type] = attr.value;
        return acc;
      }, {});

      expect(traits['Total Trees Planted']).toBe(5000);
      expect(traits['Total CO2 Sequestered (t)']).toBe(100.5);
      expect(traits['Total Sponsors']).toBe(42);
      expect(traits['Total Raised']).toBe('50000');
    });
  });

  describe('formatPersonalImpactNFTMetadata', () => {
    it('generates standard metadata for a personal impact NFT', () => {
      const metadata = ImpactNFTClient.formatPersonalImpactNFTMetadata({
        campaignId: 'camp-101',
        campaignTitle: 'Amazon Rainforest Restoration',
        sponsorAddress: 'GC9876543210',
        sponsorContribution: '2500',
        contributionSharePercentage: 5,
        personalTrees: 250,
        personalCo2Tonnes: 5.025,
        tier: 'GOLD',
      });

      expect(metadata.name).toBe('Amazon Rainforest Restoration - Personal Impact NFT');
      expect(metadata.description).toContain('GC9876543210');
      expect(metadata.description).toContain('250 trees');
      expect(metadata.description).toContain('5.025 metric tonnes of CO2');
      expect(metadata.properties.sponsorAddress).toBe('GC9876543210');
      expect(metadata.properties.personalTrees).toBe(250);
      expect(metadata.properties.personalCo2Tonnes).toBe(5.025);
      expect(metadata.properties.tier).toBe('GOLD');
      expect(metadata.properties.nftType).toBe('PERSONAL_IMPACT');

      const traits = metadata.attributes.reduce<Record<string, string | number>>((acc, attr) => {
        acc[attr.trait_type] = attr.value;
        return acc;
      }, {});

      expect(traits['Personal Trees Funded']).toBe(250);
      expect(traits['Personal CO2 Offset (t)']).toBe(5.025);
      expect(traits['Sponsor Tier']).toBe('GOLD');
      expect(traits['Funding Share (%)']).toBe(5);
    });
  });
});
