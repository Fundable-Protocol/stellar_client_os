import { beforeEach, describe, expect, it } from "vitest";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  reviewCampaignNonprofitPartner,
} from "./campaign.service";
import {
  CampaignTaxCertificateError,
  generateCampaignTaxCertificate,
} from "./campaign-tax-certificate.service";

const timestamp = (iso: string) => Date.parse(iso);

describe("campaign tax certificates", () => {
  const dataSource = new InMemoryCampaignDataSource();
  const campaignId = "tax-certificate-campaign";

  beforeEach(async () => {
    const campaign = await createCampaign({
      id: campaignId,
      creator: "creator",
      name: "Community Garden",
      goalAmount: "50000",
      nonprofitPartner: {
        legalName: "Community Garden Foundation",
        registrationNumber: "NP-123",
        country: "US",
      },
    }, dataSource, 1);
    await dataSource.saveCampaign({
      ...campaign,
      nonprofitPartner: { ...campaign.nonprofitPartner!, verificationStatus: "VERIFIED", verifiedAt: 10, verifiedBy: "reviewer" },
      sponsors: [
        { id: "s1", campaignId, address: "G-SPONSOR", amount: "1000", token: "USDC", sponsoredAt: timestamp("2025-03-01T00:00:00Z") },
        { id: "s2", campaignId, address: "g-sponsor", amount: "250", token: "USDC", sponsoredAt: timestamp("2025-07-01T00:00:00Z") },
        { id: "s3", campaignId, address: "G-SPONSOR", amount: "75", token: "XLM", sponsoredAt: timestamp("2025-09-01T00:00:00Z") },
        { id: "s4", campaignId, address: "G-SPONSOR", amount: "9000", token: "USDC", sponsoredAt: timestamp("2026-01-01T00:00:00Z") },
        { id: "s5", campaignId, address: "G-OTHER", amount: "9999", token: "USDC", sponsoredAt: timestamp("2025-05-01T00:00:00Z") },
      ],
    });
  });

  it("requires an explicit internal review to verify a submitted partner", async () => {
    const pendingCampaign = await createCampaign({
      id: "pending-partner-campaign",
      creator: "creator",
      name: "Partner Review",
      goalAmount: "1000",
      nonprofitPartner: { legalName: "Pending Foundation", registrationNumber: "NP-2", country: "US" },
    }, dataSource);
    expect(pendingCampaign.nonprofitPartner?.verificationStatus).toBe("PENDING");

    const verified = await reviewCampaignNonprofitPartner("pending-partner-campaign", "VERIFIED", "reviewer", dataSource, 20);
    expect(verified?.nonprofitPartner).toMatchObject({
      verificationStatus: "VERIFIED",
      verifiedAt: 20,
      verifiedBy: "reviewer",
    });
  });

  it("issues a PDF for a verified partner with the sponsor's annual contribution totals", async () => {
    const certificate = await generateCampaignTaxCertificate(campaignId, "G-SPONSOR", 2025, dataSource, timestamp("2026-02-01T00:00:00Z"));

    expect(certificate).toMatchObject({
      campaignName: "Community Garden",
      sponsorAddress: "G-SPONSOR",
      partnerLegalName: "Community Garden Foundation",
      partnerRegistrationNumber: "NP-123",
      taxYear: 2025,
      contributions: [
        { token: "USDC", amount: "1250" },
        { token: "XLM", amount: "75" },
      ],
      issuedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(Buffer.from(certificate.pdfBytes.slice(0, 4)).toString("latin1")).toBe("%PDF");
  });

  it("rejects campaigns whose nonprofit partner is not verified", async () => {
    const campaign = await dataSource.getCampaigns();
    await dataSource.saveCampaign({
      ...campaign[0],
      nonprofitPartner: { ...campaign[0].nonprofitPartner!, verificationStatus: "PENDING" },
    });

    await expect(generateCampaignTaxCertificate(campaignId, "G-SPONSOR", 2025, dataSource))
      .rejects.toMatchObject<Partial<CampaignTaxCertificateError>>({ code: "INELIGIBLE_CAMPAIGN" });
  });

  it("rejects invalid years and sponsors without contributions", async () => {
    await expect(generateCampaignTaxCertificate(campaignId, "G-SPONSOR", 99, dataSource))
      .rejects.toThrow("taxYear must be a valid calendar year");
    await expect(generateCampaignTaxCertificate(campaignId, "G-MISSING", 2025, dataSource))
      .rejects.toMatchObject({ code: "NO_CONTRIBUTIONS" });
  });
});