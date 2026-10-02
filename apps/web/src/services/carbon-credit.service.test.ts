import { beforeEach, describe, expect, it } from "vitest";
import { backersService } from "./campaign-backers.service";
import { carbonCreditService } from "./carbon-credit.service";

describe("carbon credit service", () => {
  beforeEach(() => {
    backersService.reset();
    carbonCreditService.reset();
    backersService.recordContribution({ campaignId: "campaign-1", backerAddress: "GALICE", amount: "75", token: "USDC" });
    backersService.recordContribution({ campaignId: "campaign-1", backerAddress: "GBOB", amount: "25", token: "USDC" });
  });

  it("only issues once for a completed campaign and allocates credits proportionally", () => {
    const issuance = carbonCreditService.finalizeIssuance({ campaignId: "campaign-1", status: "COMPLETED", verifiedTonnes: "10", verifiedTreeCount: 10, totalTreeCount: 10, now: 1 });
    expect(issuance.totalCredits).toBe("10");
    expect(carbonCreditService.finalizeIssuance({ campaignId: "campaign-1", status: "COMPLETED", verifiedTonnes: "99" }).issuanceId).toBe(issuance.issuanceId);
    expect(carbonCreditService.claimForSponsor("campaign-1", "GALICE").amount).toBe("7.5");
    expect(carbonCreditService.claimForSponsor("campaign-1", "GALICE").amount).toBe("7.5");
    expect(carbonCreditService.getBalance("GALICE")).toBe("7.5");
  });

  it("rejects incomplete verification and non-completed campaigns", () => {
    expect(() => carbonCreditService.finalizeIssuance({ campaignId: "campaign-2", status: "ACTIVE", verifiedTonnes: "1" })).toThrow();
    expect(() => carbonCreditService.finalizeIssuance({ campaignId: "campaign-3", status: "COMPLETED", verifiedTonnes: "1", verifiedTreeCount: 2, totalTreeCount: 3 })).toThrow();
  });
});
