import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PATCH } from "./route";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
} from "@/services/campaign.service";
import { campaignComplianceService } from "@/services/campaign-compliance.service";

describe("Compliance Documents API Routes", () => {
  const campaignId = "camp-api-compliance-test";

  beforeEach(async () => {
    campaignComplianceService.clearAll();
    const dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
    await createCampaign(
      {
        id: campaignId,
        creator: "GCREATOR123",
        name: "Eco Project",
        goalAmount: "5000",
      },
      dataSource
    );
  });

  it("POST /api/campaigns/[id]/compliance-documents rejects non-PDF file", async () => {
    const req = new NextRequest("http://localhost:3000/api/campaigns/" + campaignId + "/compliance-documents", {
      method: "POST",
      body: JSON.stringify({
        name: "My Photo",
        fileName: "photo.jpg",
        fileUrl: "https://example.com/photo.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
        uploadedBy: "GCREATOR123",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(400);
  });

  it("POST /api/campaigns/[id]/compliance-documents uploads a valid PDF", async () => {
    const req = new NextRequest("http://localhost:3000/api/campaigns/" + campaignId + "/compliance-documents", {
      method: "POST",
      body: JSON.stringify({
        name: "Business Registration",
        fileName: "business_reg.pdf",
        fileUrl: "https://storage.fundable.network/compliance/business_reg.pdf",
        fileSize: 1024 * 50,
        mimeType: "application/pdf",
        documentType: "business_registration",
        uploadedBy: "GCREATOR123",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.document.name).toBe("Business Registration");
    expect(data.document.verified).toBe(false);
  });

  it("GET /api/campaigns/[id]/compliance-documents lists uploaded documents", async () => {
    await campaignComplianceService.uploadDocument({
      campaignId,
      name: "Non-profit Certificate",
      fileName: "certificate.pdf",
      fileUrl: "https://example.com/certificate.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      documentType: "non_profit_status",
      uploadedBy: "GCREATOR123",
    });

    const req = new NextRequest("http://localhost:3000/api/campaigns/" + campaignId + "/compliance-documents", {
      method: "GET",
    });

    const res = await GET(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.documents.length).toBe(1);
    expect(data.documents[0].name).toBe("Non-profit Certificate");
  });

  it("PATCH /api/campaigns/[id]/compliance-documents allows platform admin to mark verified", async () => {
    const doc = await campaignComplianceService.uploadDocument({
      campaignId,
      name: "Tax Exemption Status",
      fileName: "tax_exempt.pdf",
      fileUrl: "https://example.com/tax_exempt.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      documentType: "non_profit_status",
      uploadedBy: "GCREATOR123",
    });

    const req = new NextRequest("http://localhost:3000/api/campaigns/" + campaignId + "/compliance-documents", {
      method: "PATCH",
      body: JSON.stringify({
        documentId: doc.id,
        adminAddress: "GADMIN999",
        verified: true,
        notes: "IRS 501(c)(3) active status confirmed",
      }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: campaignId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.document.verified).toBe(true);
    expect(data.document.verifiedBy).toBe("GADMIN999");
    expect(data.document.verifiedAt).toBeGreaterThan(0);
  });
});
