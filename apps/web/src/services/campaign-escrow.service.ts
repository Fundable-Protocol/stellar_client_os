/**
 * Campaign Escrow Service
 *
 * Provides application-level escrow operations: tracking escrow status,
 * verifier approvals, tree planting verification, and funds release to campaign creators (Issue #864).
 */

export enum EscrowStatus {
  Held = 'Held',
  Verified = 'Verified',
  Released = 'Released',
  Disputed = 'Disputed',
  Refunded = 'Refunded',
}

export interface CampaignEscrowDetails {
  campaignId: number;
  creator: string;
  verifier: string;
  totalEscrowed: bigint;
  releasedAmount: bigint;
  treesPlanted: number;
  targetTrees: number;
  status: EscrowStatus;
  isVerified: boolean;
  createdAt: number;
  verifiedAt: number;
}

export class CampaignEscrowService {
  /**
   * Determine if the escrow is currently verified and eligible for payout release.
   */
  static isEligibleForRelease(escrow: CampaignEscrowDetails): boolean {
    return escrow.isVerified && escrow.status === EscrowStatus.Verified && escrow.releasedAmount < escrow.totalEscrowed;
  }

  /**
   * Calculate verification progress in basis points (0 - 10,000).
   */
  static calculateVerificationProgressBps(treesPlanted: number, targetTrees: number): number {
    if (targetTrees <= 0) return 0;
    if (treesPlanted >= targetTrees) return 10000;
    return Math.floor((treesPlanted / targetTrees) * 10000);
  }

  /**
   * Apply a mediator-issued refund to an escrow (Issue #1231).
   *
   * Invoked by the dispute mediator after resolution. A full refund marks the
   * escrow as `Refunded`; a partial refund reduces `totalEscrowed` by the
   * refunded amount while leaving the remaining funds in escrow.
   *
   * @param escrow The escrow to refund.
   * @param refundAmount Amount to refund (must be > 0 and <= remaining escrow).
   * @param refundType Either `'full'` or `'partial'`.
   * @returns An updated copy of the escrow details.
   */
  static refundFromDispute(
    escrow: CampaignEscrowDetails,
    refundAmount: bigint,
    refundType: 'full' | 'partial',
  ): CampaignEscrowDetails {
    const refundableStatuses: EscrowStatus[] = [EscrowStatus.Disputed, EscrowStatus.Held, EscrowStatus.Verified];
    if (!refundableStatuses.includes(escrow.status)) {
      throw new Error(`Escrow for campaign ${escrow.campaignId} cannot be refunded from status ${escrow.status}.`);
    }

    if (refundType !== 'full' && refundType !== 'partial') {
      throw new Error(`Invalid refund type: ${refundType}. Expected 'full' or 'partial'.`);
    }

    if (refundAmount <= 0n) {
      throw new Error('Refund amount must be greater than zero.');
    }

    const remaining = escrow.totalEscrowed - escrow.releasedAmount;
    if (refundAmount > remaining) {
      throw new Error(
        `Refund amount ${refundAmount} exceeds remaining escrow balance ${remaining} for campaign ${escrow.campaignId}.`,
      );
    }

    if (refundType === 'full') {
      if (refundAmount !== remaining) {
        throw new Error(
          `Full refund must equal the remaining escrow balance ${remaining} for campaign ${escrow.campaignId}.`,
        );
      }
      return {
        ...escrow,
        status: EscrowStatus.Refunded,
        totalEscrowed: escrow.releasedAmount,
      };
    }

    return {
      ...escrow,
      totalEscrowed: escrow.totalEscrowed - refundAmount,
    };
  }

  /**
   * Format escrow status badge and human-readable explanation.
   */
  static getEscrowSummary(escrow: CampaignEscrowDetails): { label: string; description: string; canRelease: boolean } {
    switch (escrow.status) {
      case EscrowStatus.Held:
        return {
          label: 'Funds in Escrow',
          description: 'Sponsor funds are safely locked in escrow until verified tree planting is approved by the assigned verifier.',
          canRelease: false,
        };
      case EscrowStatus.Verified:
        return {
          label: 'Trees Verified',
          description: 'Verifier has confirmed tree planting. Escrow funds are ready for release to the campaign creator.',
          canRelease: true,
        };
      case EscrowStatus.Released:
        return {
          label: 'Funds Released',
          description: 'All escrowed funds have been successfully disbursed to the campaign creator.',
          canRelease: false,
        };
      case EscrowStatus.Disputed:
        return {
          label: 'Escrow Disputed',
          description: 'Verification or milestone SLA was disputed. Payouts are halted pending audit resolution.',
          canRelease: false,
        };
      case EscrowStatus.Refunded:
        return {
          label: 'Escrow Refunded',
          description: 'Sponsorship funds have been returned to contributors.',
          canRelease: false,
        };
    }
  }
}
