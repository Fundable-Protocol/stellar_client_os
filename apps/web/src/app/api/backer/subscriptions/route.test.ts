import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "./route";
import { recurringContributionService } from "@/services/recurring-contributions.service";
import { NextRequest } from "next/server";

describe("Backer subscriptions API routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 when backerAddress query param is missing in GET", async () => {
    const req = new NextRequest("http://localhost:3000/api/backer/subscriptions");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/backerAddress/);
  });

  it("returns subscriptions for a backer in GET", async () => {
    vi.spyOn(recurringContributionService, "listSubscriptionsByBacker").mockResolvedValueOnce([
      {
        id: "sub_1",
        campaignId: "c1",
        creatorAddress: "GCREATOR",
        backerAddress: "GBACKER",
        amount: "50",
        token: "USDC",
        frequency: "MONTHLY",
        cadence: "monthly",
        status: "ACTIVE",
        createdAt: 1000,
        updatedAt: 1000,
        nextChargeAt: 2000,
        totalChargedAmount: "50",
        successfulCyclesCount: 1,
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/backer/subscriptions?backerAddress=GBACKER");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.subscriptions).toHaveLength(1);
    expect(data.subscriptions[0].id).toBe("sub_1");
  });

  it("creates a subscription in POST", async () => {
    vi.spyOn(recurringContributionService, "createSubscription").mockResolvedValueOnce({
      id: "sub_new",
      campaignId: "c1",
      creatorAddress: "GCREATOR",
      backerAddress: "GBACKER",
      amount: "25",
      token: "USDC",
      frequency: "MONTHLY",
      cadence: "monthly",
      status: "ACTIVE",
      createdAt: 1000,
      updatedAt: 1000,
      nextChargeAt: 2000,
      totalChargedAmount: "25",
      successfulCyclesCount: 1,
    });

    const req = new NextRequest("http://localhost:3000/api/backer/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "c1",
        creatorAddress: "GCREATOR",
        backerAddress: "GBACKER",
        amount: "25",
        token: "USDC",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.subscription.id).toBe("sub_new");
  });
});
