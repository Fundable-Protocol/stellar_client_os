import type {
  CampaignKycConfig,
  KycRequirementCheck,
  SetCampaignKycConfigInput,
  SubmitZkProofInput,
  ZkKycRecord,
  ZkKycStatus,
  ZkProofProvider,
} from '@/types/zk-kyc-verification';

// ---------------------------------------------------------------------------
// Supported providers (constant - update as integrations grow)
// ---------------------------------------------------------------------------

export const SUPPORTED_ZK_PROVIDERS: ZkProofProvider[] = [
  'polygon_id',
  'reclaim_protocol',
  'zkpass',
  'self_protocol',
];

// ---------------------------------------------------------------------------
// ZK KYC Verification Service (Issue #1345)
// ---------------------------------------------------------------------------

/**
 * In-memory service for opt-in Zero-Knowledge KYC verification.
 *
 * Stores only wallet address + opaque proof ID + status.
 * No name, passport number, residence, or any PII is ever persisted.
 *
 * In production, the proof validation step (`_verifyProofToken`) would call
 * the relevant provider's verification API (e.g. Polygon ID node, Reclaim
 * Protocol, zkPass) to confirm the credential is valid without learning
 * the backer's identity.
 */
export class ZkKycVerificationService {
  /** Records keyed by walletAddress (lower-cased). */
  private records: Map<string, ZkKycRecord> = new Map();

  /** Campaign KYC configs keyed by campaignId. */
  private campaignConfigs: Map<string, CampaignKycConfig> = new Map();

  // -------------------------------------------------------------------------
  // Campaign configuration
  // -------------------------------------------------------------------------

  /**
   * Sets or updates the KYC threshold configuration for a campaign.
   * Only the campaign creator should call this in production.
   */
  public setCampaignKycConfig(
    campaignId: string,
    creatorAddress: string,
    input: SetCampaignKycConfigInput,
    now: number = Date.now(),
  ): CampaignKycConfig {
    if (!creatorAddress?.trim()) throw new Error('Creator address is required');
    if (!campaignId?.trim()) throw new Error('Campaign ID is required');

    if (
      input.kycThresholdXlm !== undefined &&
      input.kycThresholdXlm !== null &&
      input.kycThresholdXlm <= 0
    ) {
      throw new Error('kycThresholdXlm must be a positive number');
    }

    const existing = this.campaignConfigs.get(campaignId);
    const ts = new Date(now).toISOString();

    const config: CampaignKycConfig = {
      campaignId,
      kycEnabled: input.kycEnabled,
      kycThresholdXlm: input.kycThresholdXlm ?? null,
      acceptedProviders:
        input.acceptedProviders && input.acceptedProviders.length > 0
          ? input.acceptedProviders
          : SUPPORTED_ZK_PROVIDERS,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };

    this.campaignConfigs.set(campaignId, config);
    return config;
  }

  /** Returns the KYC config for a campaign, or null if not configured. */
  public getCampaignKycConfig(campaignId: string): CampaignKycConfig | null {
    return this.campaignConfigs.get(campaignId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Proof submission & verification
  // -------------------------------------------------------------------------

  /**
   * Submits a ZK proof for a wallet address.
   *
   * The proof token is validated (provider-specific, simulated here) and
   * the record is stored with status 'verified' or 'rejected'.
   * No PII from the proof is retained.
   */
  public submitProof(input: SubmitZkProofInput, now: number = Date.now()): ZkKycRecord {
    const wallet = normaliseWallet(input.walletAddress);

    if (!input.provider || !SUPPORTED_ZK_PROVIDERS.includes(input.provider)) {
      throw new Error(
        `Unsupported ZK provider "${input.provider}". Supported: ${SUPPORTED_ZK_PROVIDERS.join(', ')}`,
      );
    }

    if (!input.proofToken?.trim()) {
      throw new Error('proofToken is required');
    }

    const { valid, proofId } = this._verifyProofToken(input.provider, input.proofToken);
    const ts = new Date(now).toISOString();
    const status: ZkKycStatus = valid ? 'verified' : 'rejected';

    const existing = this.records.get(wallet);
    const record: ZkKycRecord = {
      walletAddress: wallet,
      status,
      provider: input.provider,
      proofId,
      verifiedAt: valid ? ts : null,
      expiresAt: input.expiresAt ?? null,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };

    this.records.set(wallet, record);
    return record;
  }

  /** Returns the KYC record for a wallet, or null if none. */
  public getRecord(walletAddress: string): ZkKycRecord | null {
    return this.records.get(normaliseWallet(walletAddress)) ?? null;
  }

  /**
   * Returns whether the wallet currently holds a valid, non-expired
   * verification from an accepted provider.
   */
  public isVerified(
    walletAddress: string,
    acceptedProviders: ZkProofProvider[] = SUPPORTED_ZK_PROVIDERS,
    now: number = Date.now(),
  ): boolean {
    const record = this.getRecord(walletAddress);
    if (!record) return false;
    if (record.status !== 'verified') return false;
    if (!acceptedProviders.includes(record.provider)) return false;
    if (record.expiresAt !== null) {
      const expMs = new Date(record.expiresAt).getTime();
      if (!Number.isNaN(expMs) && now >= expMs) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // Pledge-flow helper
  // -------------------------------------------------------------------------

  /**
   * Determines whether KYC is required and satisfied for a given
   * wallet + campaign + pledge amount combination.
   * Used by the pledge checkout flow to gate high-value contributions.
   */
  public checkKycRequirement(
    walletAddress: string,
    campaignId: string,
    pledgeAmountXlm: number,
    now: number = Date.now(),
  ): KycRequirementCheck {
    const config = this.campaignConfigs.get(campaignId) ?? null;

    const kycRequired =
      config !== null &&
      config.kycEnabled &&
      (config.kycThresholdXlm === null || pledgeAmountXlm >= config.kycThresholdXlm);

    const accepted = config?.acceptedProviders ?? SUPPORTED_ZK_PROVIDERS;
    const kycSatisfied = kycRequired
      ? this.isVerified(walletAddress, accepted, now)
      : true;

    const message = buildMessage(kycRequired, kycSatisfied, config?.kycThresholdXlm ?? null);

    return {
      walletAddress: normaliseWallet(walletAddress),
      campaignId,
      pledgeAmountXlm,
      kycRequired,
      kycSatisfied,
      message,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Simulates proof validation.
   *
   * In production this would call the provider's verification endpoint
   * (e.g., Polygon ID verification service, Reclaim Protocol attestation
   * node, zkPass gateway) with the proof token and return success/failure.
   * The implementation here accepts any non-empty token that doesn't start
   * with "INVALID_" to allow deterministic unit testing.
   */
  private _verifyProofToken(
    _provider: ZkProofProvider,
    proofToken: string,
  ): { valid: boolean; proofId: string } {
    const valid = !proofToken.startsWith('INVALID_');
    // Extract or derive an opaque proof ID – never store the raw token.
    const proofId = `proof:${proofToken.slice(0, 8)}…`;
    return { valid, proofId };
  }
}

// ---------------------------------------------------------------------------
// Private module-level helpers
// ---------------------------------------------------------------------------

function normaliseWallet(address: string): string {
  const trimmed = address?.trim();
  if (!trimmed) throw new Error('walletAddress is required');
  return trimmed.toUpperCase();
}

function buildMessage(
  kycRequired: boolean,
  kycSatisfied: boolean,
  thresholdXlm: number | null,
): string {
  if (!kycRequired) {
    return 'KYC verification is not required for this pledge.';
  }
  if (kycSatisfied) {
    return 'Your identity has been verified. You may proceed with the pledge.';
  }
  const threshold = thresholdXlm !== null ? ` above ${thresholdXlm} XLM` : '';
  return `This campaign requires ZK identity verification for pledges${threshold}. Please complete verification to proceed.`;
}

export const zkKycVerificationService = new ZkKycVerificationService();
