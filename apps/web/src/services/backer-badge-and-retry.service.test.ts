import { describe, expect, it } from "vitest";
import { BackerBadgeService } from "./backer-badge.service";
import { PledgeRetryService, RETRY_INTERVAL_MS } from "./pledge-retry.service";

describe("backer recognition", () => {
  it("awards first pledge and ten-campaign badges at the configured thresholds", () => {
    const service = new BackerBadgeService();
    expect(service.recordPledge({ address: "G1", campaignId: "c1", amount: "5", pledgedAt: 1 }).map((b) => b.key)).toContain("FIRST_PLEDGE");
    for (let i = 2; i <= 10; i += 1) service.recordPledge({ address: "G1", campaignId: `c${i}`, amount: "1", pledgedAt: i });
    expect(service.getProfile("G1").badges.map((b) => b.key)).toContain("TEN_CAMPAIGNS");
  });

  it("awards five-campaign, first-100, and escrow vote badges", () => {
    const service = new BackerBadgeService();
    for (let i = 1; i <= 5; i += 1) {
      service.recordPledge({
        address: "G2",
        campaignId: `c${i}`,
        amount: "1",
        pledgedAt: i,
        campaignBackerRank: 42,
      });
    }
    expect(service.getProfile("G2").badges.map((b) => b.key)).toContain("FIVE_CAMPAIGNS");
    expect(service.getProfile("G2").badges.map((b) => b.key)).toContain("FIRST_100_BACKERS");
    service.recordEscrowVote("G2", 99);
    expect(service.getProfile("G2").badges.map((b) => b.key)).toContain("MILESTONE_VERIFIER");
  });

  it("respects badge showcase and profile privacy for public viewers", () => {
    const service = new BackerBadgeService();
    service.recordPledge({ address: "G3", campaignId: "c1", amount: "1" });
    service.setPrivacy("G3", { showBadgeShowcase: false });
    expect(service.getProfile("G3", "G-other").badges).toHaveLength(0);
    expect(service.getProfile("G3", "G3").badges.length).toBeGreaterThan(0);

    service.setPrivacy("G3", { profilePrivate: true });
    expect(service.getProfile("G3", "G-other").hidden).toBe(true);
    expect(service.getProfile("G3", "G3").hidden).toBeFalsy();
  });
});

describe("pledge retries", () => {
  it("schedules six-hour retries and cancels after three failures", () => {
    const service = new PledgeRetryService();
    const first = service.createFailedPayment({ id: "p1", campaignId: "c1", backerAddress: "G1", amount: "10", error: "timeout", now: 100 });
    expect(first.nextRetryAt).toBe(100 + RETRY_INTERVAL_MS);
    service.retry("p1", { ok: false, error: "again", now: 200 });
    service.retry("p1", { ok: false, error: "again", now: 300 });
    const final = service.retry("p1", { ok: false, error: "again", now: 400 });
    expect(final.status).toBe("CANCELLED");
    expect(service.notificationsFor("G1").some((n) => n.type === "PAYMENT_CANCELLED")).toBe(true);
  });
});
