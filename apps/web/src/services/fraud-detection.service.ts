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
    let rapidPledgeCount = 0;

    // 1. Detect Fake Backers & Bot Clusters (e.g. many pledges created within same minute)
    if (backers.length > 5) {
      const timestamps = backers.map((b) => new Date(b.pledgedAt).getTime()).sort();
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

    const batches = input.plantingBatches ?? [];
    const reportedTrees = input.campaignSnapshot?.treeCount;
    const batchTrees = batches.reduce((sum, batch) => sum + Math.max(0, batch.treeCount), 0);
    const createdAt = input.campaignSnapshot?.createdAt ? new Date(input.campaignSnapshot.createdAt).getTime() : undefined;
    const deadline = input.campaignSnapshot?.deadline ? new Date(input.campaignSnapshot.deadline).getTime() : undefined;
    const durationDays = createdAt && deadline && deadline > createdAt ? (deadline - createdAt) / 86_400_000 : undefined;
    const maxTreesPerDay = Number(process.env.FRAUD_MAX_TREES_PER_DAY ?? 2_000);
    if ((reportedTrees !== undefined && batchTrees > 0 && Math.abs(reportedTrees - batchTrees) > Math.max(10, reportedTrees * 0.2)) || (durationDays !== undefined && batchTrees > durationDays * maxTreesPerDay)) {
      flags.push({ id: `flag-trees-${Date.now()}`, patternType: 'UNREALISTIC_TREE_COUNT', description: 'Reported planting volume is inconsistent with evidence or the campaign time window.', severityScore: 65, evidenceDetails: { reportedTrees, batchTrees, durationDays, maxTreesPerDay }, detectedAt: new Date().toISOString() });
    }

    const verificationEvents = input.verificationEvents ?? [];
    const invalidOrder = batches.some((batch) => batch.verifiedAt && new Date(batch.verifiedAt).getTime() < new Date(batch.plantedAt).getTime());
    const pairCounts = new Map<string, number>();
    for (const event of verificationEvents) {
      if (event.planterAddress && event.verifierAddress) {
        const key = `${event.planterAddress.toLowerCase()}:${event.verifierAddress.toLowerCase()}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
    const evidenceHashes = verificationEvents.map((event) => event.evidenceHash).filter((hash): hash is string => Boolean(hash));
    const duplicateEvidence = new Set(evidenceHashes).size < evidenceHashes.length;
    const repeatedPair = Array.from(pairCounts.values()).some((count) => count >= 3);
    if (invalidOrder || duplicateEvidence || repeatedPair || batches.some((batch) => !batch.verifiedAt && batch.treeCount > 0)) {
      flags.push({ id: `flag-verification-${Date.now()}`, patternType: 'VERIFICATION_ANOMALY', description: 'Planting verification history contains ordering, reuse, or incomplete-verification anomalies.', severityScore: 70, evidenceDetails: { invalidOrder, duplicateEvidence, repeatedPair, unverifiedBatches: batches.filter((batch) => !batch.verifiedAt).length }, detectedAt: new Date().toISOString() });
    }

    const youngRapidBackers = backers.filter((backer) => (backer.accountAgeDays ?? 999) < 1);
    if (youngRapidBackers.length >= 3 && rapidPledgeCount >= 3) {
      flags.push({ id: `flag-bot-${Date.now()}`, patternType: 'BOT_SPONSOR', description: 'Several newly created sponsor profiles pledged in a short burst.', severityScore: 55, evidenceDetails: { youngBackers: youngRapidBackers.length, rapidPledgeCount }, detectedAt: new Date().toISOString() });
    }

    const submitted = input.submittedLocation;
    const plantingWithGps = batches.filter((batch) => Number.isFinite(batch.latitude) && Number.isFinite(batch.longitude));
    if (submitted && plantingWithGps.length > 0) {
      const radians = (value: number) => value * Math.PI / 180;
      const distances = plantingWithGps.map((batch) => {
        const dLat = radians((batch.latitude as number) - submitted.latitude);
        const dLon = radians((batch.longitude as number) - submitted.longitude);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(submitted.latitude)) * Math.cos(radians(batch.latitude as number)) * Math.sin(dLon / 2) ** 2;
        return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      });
      const maxDistanceKm = Math.max(...distances);
      if (maxDistanceKm > Number(process.env.FRAUD_LOCATION_TOLERANCE_KM ?? 50)) {
        flags.push({ id: `flag-location-${Date.now()}`, patternType: 'LOCATION_MISMATCH', description: 'Submitted campaign location differs materially from planting evidence coordinates.', severityScore: 60, evidenceDetails: { maxDistanceKm, plantingSamples: distances.length }, detectedAt: new Date().toISOString() });
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
