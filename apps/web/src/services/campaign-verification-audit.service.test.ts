import { describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { CampaignVerificationAuditService } from "./campaign-verification-audit.service";

describe("CampaignVerificationAuditService (#866)", () => {
  it("logs full sequence of verification activities immutably", async () => {
    const dataSource = new InMemoryCampaignDataSource();
    const service = new CampaignVerificationAuditService(dataSource);

    await createCampaign(
      { id: "c-audit-1", creator: "GCREATOR1", name: "Mangrove Replanting", goalAmount: "5000" },
      dataSource,
      1000
    );

    // 1. Submitted for review
    const ev1 = await service.logActivity("c-audit-1", {
      eventType: "submitted_for_review",
      actorId: "GCREATOR1",
      occurredAt: 2000,
      comment: "All planting milestones completed for zone A",
    });
    expect(ev1.previousHash).toBeNull();
    expect(ev1.entryHash).toBeDefined();

    // 2. Photo uploaded
    const ev2 = await service.logActivity("c-audit-1", {
      eventType: "photo_uploaded",
      actorId: "GCREATOR1",
      occurredAt: 2100,
      evidenceId: "photo-001",
      evidenceUrl: "https://ipfs.io/ipfs/QmExample123",
      comment: "Drone survey photo of saplings",
    });
    expect(ev2.previousHash).toBe(ev1.entryHash);

    // 3. Verifier comment
    const ev3 = await service.logActivity("c-audit-1", {
      eventType: "verifier_comment",
      actorId: "GVERIFIER99",
      occurredAt: 2200,
      comment: "Sapling density verified via satellite imagery",
    });
    expect(ev3.previousHash).toBe(ev2.entryHash);

    // 4. Approved
    const ev4 = await service.logActivity("c-audit-1", {
      eventType: "approved",
      actorId: "GVERIFIER99",
      occurredAt: 2300,
      comment: "Field verification approved without conditions",
      blockchainTxHash: "tx_mock_hash_0x123abc456",
    });
    expect(ev4.previousHash).toBe(ev3.entryHash);

    // Fetch summary
    const summary = await service.getAuditTrailSummary("c-audit-1");
    expect(summary).not.toBeNull();
    expect(summary?.totalActivities).toBe(4);
    expect(summary?.isImmutableAndValid).toBe(true);
    expect(summary?.latestEntryHash).toBe(ev4.entryHash);
    expect(summary?.activityCounts.submitted_for_review).toBe(1);
    expect(summary?.activityCounts.photo_uploaded).toBe(1);
    expect(summary?.activityCounts.verifier_comment).toBe(1);
    expect(summary?.activityCounts.approved).toBe(1);
    expect(summary?.activityCounts.rejected).toBe(0);

    // Filter activities by eventType
    const photos = await service.filterActivities("c-audit-1", { eventType: "photo_uploaded" });
    expect(photos).toHaveLength(1);
    expect(photos[0].evidenceId).toBe("photo-001");

    // Generate certificate
    const cert = await service.generateAuditCertificate("c-audit-1");
    expect(cert.auditTrailLength).toBe(4);
    expect(cert.cryptographicIntegrity).toBe(true);
    expect(cert.rootHash).toBe(ev4.entryHash);
  });
});
