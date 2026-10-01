import { describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { appendVerificationEvent, getVerificationAuditTrail, verifyVerificationAuditTrail } from "./campaign-verification.service";

describe("campaign verification audit trail", () => {
  it("appends a hash-chained immutable audit trail", async () => {
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: "campaign-1", creator: "GCREATOR", name: "Forest", goalAmount: "100" }, source, 1000);
    const first = await appendVerificationEvent("campaign-1", { eventType: "submitted_for_review", actorId: "GCREATOR", occurredAt: 2000 }, source);
    const second = await appendVerificationEvent("campaign-1", { eventType: "verifier_comment", actorId: "GVERIFIER", comment: "GPS evidence looks good", occurredAt: 3000 }, source);
    expect(second.previousHash).toBe(first.entryHash);
    const trail = await getVerificationAuditTrail("campaign-1", source);
    expect(trail).toHaveLength(2);
    expect(verifyVerificationAuditTrail(trail!)).toBe(true);
    trail![0].comment = "tampered";
    expect(verifyVerificationAuditTrail(trail!)).toBe(false);
  });
});
