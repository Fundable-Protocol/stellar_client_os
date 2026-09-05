import { describe, expect, it, beforeEach } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "../../../../services/campaign.service";
import { POST } from "./route";

const ts = (iso: string): number => Date.parse(iso);

describe("POST /api/tax/generate-1099", () => {
  const dataSource = new InMemoryCampaignDataSource();

  beforeEach(async () => {
    setCampaignDataSource(dataSource);
    const campaign = await createCampaign(
      { id: "tax-campaign", creator: "G-ALICE", name: "Clean water", goalAmount: "10000" },
      dataSource,
    );
    await dataSource.saveCampaign({
      ...campaign,
      status: "ACTIVE",
      raisedAmount: "3500",
      sponsorCount: 2,
      sponsors: [
        { id: "s1", campaignId: "tax-campaign", address: "G-BOB", amount: "1000", token: "USDC", sponsoredAt: ts("2025-03-01T12:00:00Z") },
        { id: "s2", campaignId: "tax-campaign", address: "G-CAROL", amount: "2500", token: "USDC", sponsoredAt: ts("2025-07-20T08:30:00Z") },
        { id: "s3", campaignId: "tax-campaign", address: "G-DAVE", amount: "99999", token: "USDC", sponsoredAt: ts("2026-01-01T00:00:00Z") },
      ],
    });
  });

  it("returns computed annual earnings for a creator", async () => {
    const response = await POST(
      new Request("http://localhost/api/tax/generate-1099", {
        method: "POST",
        body: JSON.stringify({ creatorId: "G-ALICE", taxYear: 2025 }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
      creatorId: "G-ALICE",
      taxYear: 2025,
      grossEarningsUSDC: "3500.00",
      totalTransactions: 2,
    });
  });

  it("rejects missing or invalid fields with 400", async () => {
    const missing = await POST(
      new Request("http://localhost/api/tax/generate-1099", {
        method: "POST",
        body: JSON.stringify({ taxYear: 2025 }),
      }),
    );
    expect(missing.status).toBe(400);

    const badYear = await POST(
      new Request("http://localhost/api/tax/generate-1099", {
        method: "POST",
        body: JSON.stringify({ creatorId: "G-ALICE", taxYear: 99 }),
      }),
    );
    expect(badYear.status).toBe(400);
  });

  it("returns zeroed earnings for a creator with no funding", async () => {
    const response = await POST(
      new Request("http://localhost/api/tax/generate-1099", {
        method: "POST",
        body: JSON.stringify({ creatorId: "G-UNKNOWN", taxYear: 2025 }),
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toMatchObject({
      grossEarningsUSDC: "0.00",
      totalTransactions: 0,
    });
  });
});