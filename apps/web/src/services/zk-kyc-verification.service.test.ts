import { beforeEach, describe, expect, it } from 'vitest';
import { ZkKycVerificationService, SUPPORTED_ZK_PROVIDERS } from './zk-kyc-verification.service';

const WALLET = 'GBACKERWALLETADDRESSVALID000000000000000000000000000000';
const CAMPAIGN_ID = 'campaign-kyc-001';
const CREATOR = 'GCREATOR000000000000000000000000000000000000000000000000';
const NOW = new Date('2026-10-01T00:00:00Z').getTime();

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    walletAddress: WALLET,
    provider: 'polygon_id' as const,
    proofToken: 'VALID_TOKEN_ABCDEF1234567890',
    ...overrides,
  };
}

describe('ZkKycVerificationService (#1345)', () => {
  let service: ZkKycVerificationService;

  beforeEach(() => {
    service = new ZkKycVerificationService();
  });

  // -------------------------------------------------------------------------
  // Campaign KYC config
  // -------------------------------------------------------------------------

  describe('setCampaignKycConfig', () => {
    it('creates a config with threshold and enabled flag', () => {
      const cfg = service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
        kycEnabled: true,
        kycThresholdXlm: 10_000,
      }, NOW);

      expect(cfg.kycEnabled).toBe(true);
      expect(cfg.kycThresholdXlm).toBe(10_000);
      expect(cfg.acceptedProviders).toEqual(SUPPORTED_ZK_PROVIDERS);
    });

    it('uses custom acceptedProviders when provided', () => {
      const cfg = service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
        kycEnabled: true,
        kycThresholdXlm: 5_000,
        acceptedProviders: ['polygon_id', 'zkpass'],
      }, NOW);

      expect(cfg.acceptedProviders).toEqual(['polygon_id', 'zkpass']);
    });

    it('rejects zero or negative threshold', () => {
      expect(() =>
        service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
          kycEnabled: true,
          kycThresholdXlm: -1,
        }, NOW),
      ).toThrow('positive');
    });

    it('rejects missing creator address', () => {
      expect(() =>
        service.setCampaignKycConfig(CAMPAIGN_ID, '', { kycEnabled: false }, NOW),
      ).toThrow('Creator address');
    });

    it('returns null config when not set', () => {
      expect(service.getCampaignKycConfig('unknown')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Proof submission
  // -------------------------------------------------------------------------

  describe('submitProof', () => {
    it('accepts a valid proof and marks wallet as verified', () => {
      const record = service.submitProof(makeInput(), NOW);
      expect(record.status).toBe('verified');
      expect(record.walletAddress).toBe(WALLET.toUpperCase());
      expect(record.proofId).toMatch(/^proof:/);
      expect(record.verifiedAt).not.toBeNull();
    });

    it('normalises wallet address to uppercase', () => {
      const record = service.submitProof(
        makeInput({ walletAddress: WALLET.toLowerCase() }),
        NOW,
      );
      expect(record.walletAddress).toBe(WALLET.toUpperCase());
    });

    it('rejects a proof starting with INVALID_', () => {
      const record = service.submitProof(
        makeInput({ proofToken: 'INVALID_BAD_TOKEN' }),
        NOW,
      );
      expect(record.status).toBe('rejected');
      expect(record.verifiedAt).toBeNull();
    });

    it('rejects an unsupported provider', () => {
      expect(() =>
        service.submitProof(makeInput({ provider: 'unknown_provider' as never }), NOW),
      ).toThrow('Unsupported ZK provider');
    });

    it('rejects an empty proofToken', () => {
      expect(() => service.submitProof(makeInput({ proofToken: '' }), NOW)).toThrow(
        'proofToken is required',
      );
    });

    it('stores expiresAt on the record', () => {
      const expiresAt = new Date(NOW + 86_400_000).toISOString();
      const record = service.submitProof(makeInput({ expiresAt }), NOW);
      expect(record.expiresAt).toBe(expiresAt);
    });
  });

  // -------------------------------------------------------------------------
  // isVerified
  // -------------------------------------------------------------------------

  describe('isVerified', () => {
    it('returns true for a verified non-expired record', () => {
      service.submitProof(makeInput(), NOW);
      expect(service.isVerified(WALLET, SUPPORTED_ZK_PROVIDERS, NOW)).toBe(true);
    });

    it('returns false for an unregistered wallet', () => {
      expect(service.isVerified('GNORECORD0000000000000000000000000000000000000000000000', SUPPORTED_ZK_PROVIDERS, NOW)).toBe(false);
    });

    it('returns false for a rejected record', () => {
      service.submitProof(makeInput({ proofToken: 'INVALID_TOKEN' }), NOW);
      expect(service.isVerified(WALLET, SUPPORTED_ZK_PROVIDERS, NOW)).toBe(false);
    });

    it('returns false when proof has expired', () => {
      const expiresAt = new Date(NOW + 1000).toISOString();
      service.submitProof(makeInput({ expiresAt }), NOW);
      // Check after expiry
      expect(service.isVerified(WALLET, SUPPORTED_ZK_PROVIDERS, NOW + 2000)).toBe(false);
    });

    it('returns false when provider is not in accepted list', () => {
      service.submitProof(makeInput({ provider: 'polygon_id' }), NOW);
      expect(service.isVerified(WALLET, ['zkpass'], NOW)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // checkKycRequirement
  // -------------------------------------------------------------------------

  describe('checkKycRequirement', () => {
    it('requires KYC when pledge exceeds threshold and wallet is unverified', () => {
      service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
        kycEnabled: true,
        kycThresholdXlm: 10_000,
      }, NOW);

      const result = service.checkKycRequirement(WALLET, CAMPAIGN_ID, 15_000, NOW);

      expect(result.kycRequired).toBe(true);
      expect(result.kycSatisfied).toBe(false);
      expect(result.message).toContain('requires ZK identity verification');
    });

    it('does not require KYC when pledge is below threshold', () => {
      service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
        kycEnabled: true,
        kycThresholdXlm: 10_000,
      }, NOW);

      const result = service.checkKycRequirement(WALLET, CAMPAIGN_ID, 5_000, NOW);

      expect(result.kycRequired).toBe(false);
      expect(result.kycSatisfied).toBe(true);
    });

    it('returns satisfied when wallet is verified and KYC is required', () => {
      service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
        kycEnabled: true,
        kycThresholdXlm: 10_000,
      }, NOW);
      service.submitProof(makeInput(), NOW);

      const result = service.checkKycRequirement(WALLET, CAMPAIGN_ID, 15_000, NOW);

      expect(result.kycRequired).toBe(true);
      expect(result.kycSatisfied).toBe(true);
      expect(result.message).toContain('verified');
    });

    it('does not require KYC when kycEnabled=false regardless of threshold', () => {
      service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
        kycEnabled: false,
        kycThresholdXlm: 1_000,
      }, NOW);

      const result = service.checkKycRequirement(WALLET, CAMPAIGN_ID, 500_000, NOW);
      expect(result.kycRequired).toBe(false);
    });

    it('does not require KYC for campaigns without a config', () => {
      const result = service.checkKycRequirement(WALLET, 'no-config-campaign', 999_999, NOW);
      expect(result.kycRequired).toBe(false);
      expect(result.kycSatisfied).toBe(true);
    });

    it('requires KYC for all pledges when threshold is null and kycEnabled', () => {
      service.setCampaignKycConfig(CAMPAIGN_ID, CREATOR, {
        kycEnabled: true,
        kycThresholdXlm: null,
      }, NOW);

      const result = service.checkKycRequirement(WALLET, CAMPAIGN_ID, 1, NOW);
      expect(result.kycRequired).toBe(true);
    });
  });
});
