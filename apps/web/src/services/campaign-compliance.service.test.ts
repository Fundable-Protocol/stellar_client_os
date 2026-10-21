import { describe, it, expect, beforeEach } from "vitest";
import { CampaignComplianceService } from "./campaign-compliance.service";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
} from "./campaign.service";
import { MAX_COMPLIANCE_FILE_SIZE } from "@/types/campaign-compliance";

describe("CampaignComplianceService", () => {
  let service: CampaignComplianceService;
  const campaignId = "camp-compliance-test";

  beforeEach(async () => {
    service = new CampaignComplianceService();
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

  describe("File Validation", () => {
    it("accepts valid PDF within 10MB", () => {
      const result = service.validateFile({
        name: "registration.pdf",
        type: "application/pdf",
        size: 5 * 1024 * 1024,
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects non-PDF files", () => {
      const result = service.validateFile({
        name: "evidence.png",
        type: "image/png",
        size: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Only PDF documents are allowed");
    });

    it("rejects files larger than 10MB", () => {
      const result = service.validateFile({
        name: "big_doc.pdf",
        type: "application/pdf",
        size: MAX_COMPLIANCE_FILE_SIZE + 1,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File size exceeds maximum limit of 10 MB");
    });

    it("rejects zero-byte files", () => {
      const result = service.validateFile({
        name: "empty.pdf",
        type: "application/pdf",
        size: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File cannot be empty");
    });
  });

  describe("Document Upload", () => {
    it("allows creators to upload compliance document", async () => {
      const doc = await service.uploadDocument({
        campaignId,
        name: "501(c)(3) Non-Profit Determination",
        fileName: "non_profit_status.pdf",
        fileUrl: "https://storage.fundable.network/compliance/non_profit_status.pdf",
        fileSize: 1024 * 500,
        mimeType: "application/pdf",
        documentType: "non_profit_status",
        uploadedBy: "GCREATOR123",
      });

      expect(doc.id).toBeDefined();
      expect(doc.campaignId).toBe(campaignId);
      expect(doc.name).toBe("501(c)(3) Non-Profit Determination");
      expect(doc.fileName).toBe("non_profit_status.pdf");
      expect(doc.uploadedAt).toBeGreaterThan(0);
      expect(doc.verified).toBe(false);

      const docs = await service.getDocuments(campaignId);
      expect(docs.length).toBe(1);
      expect(docs[0].id).toBe(doc.id);
    });

    it("fails upload if campaign does not exist", async () => {
      await expect(
        service.uploadDocument({
          campaignId: "non-existent-campaign",
          name: "Business Reg",
          fileName: "reg.pdf",
          fileUrl: "https://example.com/reg.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          uploadedBy: "GCREATOR123",
        })
      ).rejects.toThrow("Campaign not found");
    });
  });

  describe("Admin Verification", () => {
    it("allows platform admin to mark compliance document as verified", async () => {
      const doc = await service.uploadDocument({
        campaignId,
        name: "State Business Registration",
        fileName: "business_registration.pdf",
        fileUrl: "https://storage.fundable.network/compliance/business_registration.pdf",
        fileSize: 2048,
        mimeType: "application/pdf",
        documentType: "business_registration",
        uploadedBy: "GCREATOR123",
      });

      expect(doc.verified).toBe(false);

      const verifiedDoc = await service.verifyDocument({
        campaignId,
        documentId: doc.id,
        adminAddress: "GADMIN999",
        verified: true,
        notes: "Verified against state business registry.",
      });

      expect(verifiedDoc.verified).toBe(true);
      expect(verifiedDoc.verifiedBy).toBe("GADMIN999");
      expect(verifiedDoc.verifiedAt).toBeGreaterThan(0);
      expect(verifiedDoc.notes).toBe("Verified against state business registry.");

      const docs = await service.getDocuments(campaignId);
      expect(docs[0].verified).toBe(true);
      expect(docs[0].verifiedBy).toBe("GADMIN999");
    });

    it("allows admin to revoke verification", async () => {
      const doc = await service.uploadDocument({
        campaignId,
        name: "Forestry Certification",
        fileName: "fsc_cert.pdf",
        fileUrl: "https://example.com/cert.pdf",
        fileSize: 4096,
        mimeType: "application/pdf",
        documentType: "certification",
        uploadedBy: "GCREATOR123",
      });

      await service.verifyDocument({
        campaignId,
        documentId: doc.id,
        adminAddress: "GADMIN999",
        verified: true,
      });

      const unverified = await service.verifyDocument({
        campaignId,
        documentId: doc.id,
        adminAddress: "GADMIN999",
        verified: false,
      });

      expect(unverified.verified).toBe(false);
      expect(unverified.verifiedBy).toBeUndefined();
    });
  });
});
