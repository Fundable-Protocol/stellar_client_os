import { describe, expect, it, beforeEach } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "../../../../services/campaign.service";
import { POST } from "./route";

const ts = (iso: string): number => Date.parse(iso);

describe("POST /api/tax/documents", () => {
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
      ],
    });
  });

  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/tax/documents", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );

  it("streams a 1099-NEC PDF by default", async () => {
    const response = await post({ creatorId: "G-ALICE", taxYear: 2025 });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("tax-us-1099-nec-2025-G-ALICE.pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(100);
    expect(bytes.slice(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("selects the form from the creator's jurisdiction", async () => {
    const eu = await post({ creatorId: "G-ALICE", taxYear: 2025, jurisdiction: "EU" });
    expect(eu.headers.get("content-disposition")).toContain("tax-eu-vat-oss-2025");

    const other = await post({ creatorId: "G-ALICE", taxYear: 2025, jurisdiction: "OTHER" });
    expect(other.headers.get("content-disposition")).toContain("tax-earnings-statement-2025");
  });

  it("rejects an unsupported documentType with 400", async () => {
    const response = await post({ creatorId: "G-ALICE", taxYear: 2025, documentType: "ir-625" });
    expect(response.status).toBe(400);
  });

  it("rejects a missing creatorId with 400", async () => {
    const response = await post({ taxYear: 2025 });
    expect(response.status).toBe(400);
  });
});