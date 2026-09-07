/**
 * AI Fraud Detection & Pattern Prevention Service — Issue #796
 *
 * ML-based fraud detection engine flagging suspicious patterns:
 * fake backers, duplicate accounts, money laundering patterns, and circular transactions.
 * Automatically suspends campaigns with critical risk scores (> 80).
 */

import {
  AnalyzeCampaignInput,
  CampaignSecurityStatus,
  FraudDetectionReport,
  FraudPatternType,
  RiskLevel,
  SuspiciousActivityFlag,
} from '@/types/fraud-detection';

export class FraudDetectionService {
  private reports: Map<string, FraudDetectionReport> = new Map();
  private securityStatuses: Map<string, CampaignSecurityStatus> = new Map();

  /**
   * Analyze campaign backers and transaction patterns using AI/ML heuristics.
   */
  public async analyzeCampaign(input: AnalyzeCampaignInput): Promise<FraudDetectionReport> {
    const flags: SuspiciousActivityFlag[] = [];
    const backers = input.backers || [];
    const transactions = input.transactions || [];

    // 1. Detect Fake Backers & Bot Clusters (e.g. many pledges created within same minute)
    if (backers.length > 5) {
      const timestamps = backers.map((b) => new Date(b.pledgedAt).getTime()).sort();
      let rapidPledgeCount = 0;
      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] - timestamps[i - 1] < 10_000) {
          // pledges within 10 seconds
          rapidPledgeCount++;
        }
      }

      if (rapidPledgeCount >= 3) {
        flags.push({
          id: `flag-fb-${Date.now()}`,
          patternType: 'FAKE_BACKERS',
          description: 'High pledge velocity detected: Multiple backer pledges within seconds.',
          severityScore: 75,
          evidenceDetails: { rapidPledgeCount, totalBackers: backers.length },
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // 2. Detect Duplicate Accounts & IP Clustering
    const ipCounts: Record<string, number> = {};
    for (const b of backers) {
      if (b.ipAddress) {
        ipCounts[b.ipAddress] = (ipCounts[b.ipAddress] || 0) + 1;
      }
    }

    const clusteredIps = Object.entries(ipCounts).filter(([_, count]) => count >= 3);
    if (clusteredIps.length > 0) {
      flags.push({
        id: `flag-ip-${Date.now()}`,
        patternType: 'DUPLICATE_ACCOUNTS',
        description: 'Multiple backer accounts originating from identical IP address.',
        severityScore: 85,
        evidenceDetails: { clusteredIps },
        detectedAt: new Date().toISOString(),
      });
    }

    // 3. Detect Money Laundering / Circular Transactions
    if (input.creatorAddress && transactions.length > 0) {
      const creatorAddr = input.creatorAddress.toLowerCase();
      const circularTxs = transactions.filter(
        (tx) => tx.from.toLowerCase() === creatorAddr || tx.to.toLowerCase() === creatorAddr
      );

      if (circularTxs.length >= 2) {
        flags.push({
          id: `flag-ml-${Date.now()}`,
          patternType: 'MONEY_LAUNDERING',
          description: 'Circular transaction flow between campaign creator and backers.',
          severityScore: 90,
          evidenceDetails: { circularCount: circularTxs.length },
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Calculate overall risk score
    let overallRiskScore = 0;
    if (flags.length > 0) {
      const maxScore = Math.max(...flags.map((f) => f.severityScore));
      overallRiskScore = Math.min(100, Math.round(maxScore + (flags.length - 1) * 5));
    }

    let riskLevel: RiskLevel = 'LOW';
    if (overallRiskScore >= 80) riskLevel = 'CRITICAL';
    else if (overallRiskScore >= 60) riskLevel = 'HIGH';
    else if (overallRiskScore >= 35) riskLevel = 'MEDIUM';

    const recommendation =
      overallRiskScore >= 80 ? 'AUTO_SUSPEND' : overallRiskScore >= 50 ? 'REVIEW' : 'PASS';

    const isSuspended = recommendation === 'AUTO_SUSPEND';

    const report: FraudDetectionReport = {
      campaignId: input.campaignId,
      overallRiskScore,
      riskLevel,
      flags,
      isSuspended,
      analyzedBackerCount: backers.length,
      analyzedTxCount: transactions.length,
      scannedAt: new Date().toISOString(),
      recommendation,
    };

    this.reports.set(input.campaignId, report);

    if (isSuspended) {
      await this.suspendCampaign(
        input.campaignId,
        `Auto-suspended by AI Fraud Prevention system (Risk Score: ${overallRiskScore})`
      );
    } else {
      if (!this.securityStatuses.has(input.campaignId)) {
        this.securityStatuses.set(input.campaignId, {
          campaignId: input.campaignId,
          status: flags.length > 0 ? 'FLAGGED' : 'ACTIVE',
        });
      }
    }

    return report;
  }

  /**
   * Get latest fraud analysis report for a campaign.
   */
  public async getFraudReport(campaignId: string): Promise<FraudDetectionReport | null> {
    return this.reports.get(campaignId) || null;
  }

  /**
   * Get campaign security status.
   */
  public async getSecurityStatus(campaignId: string): Promise<CampaignSecurityStatus> {
    return (
      this.securityStatuses.get(campaignId) || {
        campaignId,
        status: 'ACTIVE',
      }
    );
  }

  /**
   * Suspend a flagged campaign.
   */
  public async suspendCampaign(campaignId: string, reason: string): Promise<CampaignSecurityStatus> {
    const status: CampaignSecurityStatus = {
      campaignId,
      status: 'SUSPENDED',
      suspendedAt: new Date().toISOString(),
      reason,
    };

    this.securityStatuses.set(campaignId, status);

    const report = this.reports.get(campaignId);
    if (report) {
      report.isSuspended = true;
      report.recommendation = 'AUTO_SUSPEND';
    }

    return status;
  }
}

export const fraudDetectionService = new FraudDetectionService();
