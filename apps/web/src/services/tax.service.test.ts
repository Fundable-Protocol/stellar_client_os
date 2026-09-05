import { describe, expect, it } from "vitest";
import {
  formatUnitsAsUsdc,
  generateTaxDocument,
  loadCreatorTaxYearEarnings,
  selectTaxDocumentType,
  SUPPORTED_TAX_DOCUMENT_TYPES,
  TaxDocumentError,
  type TaxDocumentInput,
} from "./tax.service";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
} from "./campaign.service";

const ts = (iso: string): number => Date.parse(iso);

function seedDataSource() {
  const dataSource = new InMemoryCampaignDataSource();
  setCampaignDataSource(dataSource);
  return dataSource;
}

async function seedCampaigns(dataSource: InMemoryCampaignDataSource) {
  const campaignA = await createCampaign(
    { id: "campaign-a", creator: "G-ALICE", name: "Clean water", goalAmount: "10000" },
    dataSource,
  );
  await dataSource.saveCampaign({
    ...campaignA,
    status: "ACTIVE",
    raisedAmount: "3500",
    sponsorCount: 2,
    sponsors: [
      { id: "s1", campaignId: "campaign-a", address: "G-BOB", amount: "1000", token: "USDC", sponsoredAt: ts("2025-03-01T12:00:00Z") },
      { id: "s2", campaignId: "campaign-a", address: "G-CAROL", amount: "2500", token: "USDC", sponsoredAt: ts("2025-07-20T08:30:00Z") },
      { id: "s3", campaignId: "campaign-a", address: "G-DAVE", amount: "4000", token: "USDC", sponsoredAt: ts("2026-01-01T00:00:00Z") },
    ],
  });

  const campaignB = await createCampaign(
    { id: "campaign-b", creator: "G-BOB", name: "Other creator", goalAmount: "5000" },
    dataSource,
  );
  await dataSource.saveCampaign({
    ...campaignB,
    sponsors: [
      { id: "s9", campaignId: "campaign-b", address: "G-ALICE", amount: "7000", token: "USDC", sponsoredAt: ts("2025-05-05T00:00:00Z") },
    ],
  });
}

describe("selectTaxDocumentType", () => {
  it("maps every jurisdiction to a supported document type", () => {
    expect(selectTaxDocumentType("US")).toBe("us-1099-nec");
    expect(selectTaxDocumentType("EU")).toBe("eu-vat-oss");
    expect(selectTaxDocumentType("OTHER")).toBe("earnings-statement");
  });

  it("every registry form type is a supported value", () => {
    for (const form of SUPPORTED_TAX_DOCUMENT_TYPES) {
      expect(["us-1099-nec", "eu-vat-oss", "earnings-statement"]).toContain(form.documentType);
    }
  });
});

describe("formatUnitsAsUsdc", () => {
  it("renders whole USDC units with two decimals", () => {
    expect(formatUnitsAsUsdc(12500n)).toBe("12500.00");
    expect(formatUnitsAsUsdc(0n)).toBe("0.00");
  });
});

describe("loadCreatorTaxYearEarnings", () => {
  it("aggregates a creator's sponsorship funding for the tax year", async () => {
    const dataSource = seedDataSource();
    await seedCampaigns(dataSource);

    const earnings = await loadCreatorTaxYearEarnings("G-ALICE", 2025);

    expect(earnings.grossEarningsUSDC).toBe("3500.00");
    expect(earnings.totalTransactions).toBe(2);
    expect(earnings.transactions[0]).toMatchObject({
      amount: "1000",
      reference: "campaign-a:s1",
    });
  });

  it("excludes funding received in other years (Dec 31 / Jan 1 boundary)", async () => {
    const dataSource = seedDataSource();
    await seedCampaigns(dataSource);

    const boundarySrc = new InMemoryCampaignDataSource();
    const campaign = await createCampaign(
      { id: "boundary", creator: "G-ZED", name: "Boundary", goalAmount: "1000" },
      boundarySrc,
    );
    await boundarySrc.saveCampaign({
      ...campaign,
      sponsors: [
        { id: "x1", campaignId: "boundary", address: "G-A", amount: "100", token: "USDC", sponsoredAt: ts("2025-12-31T23:59:59Z") },
        { id: "x2", campaignId: "boundary", address: "G-B", amount: "900", token: "USDC", sponsoredAt: ts("2026-01-01T00:00:00Z") },
      ],
    });

    const earnings = await loadCreatorTaxYearEarnings("G-ZED", 2025, boundarySrc);

    expect(earnings.grossEarningsUSDC).toBe("100.00");
    expect(earnings.totalTransactions).toBe(1);
  });

  it("does not count another creator's funding", async () => {
    const dataSource = seedDataSource();
    await seedCampaigns(dataSource);

    const earnings = await loadCreatorTaxYearEarnings("G-BOB", 2025);

    expect(earnings.grossEarningsUSDC).toBe("7000.00");
    expect(earnings.totalTransactions).toBe(1);
  });

  it("returns zeroed totals for a creator with no funding", async () => {
    const dataSource = seedDataSource();
    await seedCampaigns(dataSource);

    const earnings = await loadCreatorTaxYearEarnings("G-NOBODY", 2025);

    expect(earnings.grossEarningsUSDC).toBe("0.00");
    expect(earnings.totalTransactions).toBe(0);
    expect(earnings.transactions).toHaveLength(0);
  });
});

describe("generateTaxDocument", () => {
  const YEAR = 2025;

  const baseInput = (documentType: TaxDocumentInput["documentType"]): TaxDocumentInput => ({
    creatorId: "G-ALICE",
    taxYear: YEAR,
    documentType,
    grossEarningsUSDC: "3500.00",
    totalTransactions: 2,
    creatorName: "Alice",
    taxId: "12-3456789",
  });

  for (const documentType of SUPPORTED_TAX_DOCUMENT_TYPES.map((f) => f.documentType)) {
    it(`emits a %PDF document for ${documentType}`, async () => {
      const result = await generateTaxDocument(baseInput(documentType));

      expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
      expect(result.pdfBytes.length).toBeGreaterThan(100);
      expect(Buffer.from(result.pdfBytes.slice(0, 4)).toString("latin1")).toBe("%PDF");
      expect(result.documentId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.generatedAt).toEqual(expect.any(String));
    });
  }

  it("rejects an unsupported document type", async () => {
    await expect(
      generateTaxDocument({ ...baseInput("us-1099-nec"), documentType: "wtf" as never }),
    ).rejects.toThrow(TaxDocumentError);
  });

  it("rejects an invalid tax year", async () => {
    await expect(
      generateTaxDocument({ ...baseInput("us-1099-nec"), taxYear: 99 }),
    ).rejects.toThrow(/taxYear/);
  });
});