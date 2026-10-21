import {
  ComplianceDocument,
  MAX_COMPLIANCE_FILE_SIZE,
  ALLOWED_COMPLIANCE_MIME_TYPES,
  UploadComplianceDocumentInput,
  VerifyComplianceDocumentInput,
} from "@/types/campaign-compliance";
import { getCampaign } from "./campaign.service";

/**
 * Campaign Compliance Document Service
 *
 * Handles creator compliance document uploads (PDF, max 10MB),
 * listing compliance documents for backer due diligence, and
 * platform admin verification.
 */
export class CampaignComplianceService {
  private documents: Map<string, ComplianceDocument[]> = new Map(); // campaignId -> documents

  /**
   * Validate compliance document file payload against size (max 10MB) and type (PDF).
   */
  public validateFile(file: { size: number; type: string; name: string }): { valid: boolean; error?: string } {
    if (!file) {
      return { valid: false, error: "No file provided" };
    }

    if (file.size > MAX_COMPLIANCE_FILE_SIZE) {
      return { valid: false, error: `File size exceeds maximum limit of 10 MB (${file.size} bytes)` };
    }

    if (file.size <= 0) {
      return { valid: false, error: "File cannot be empty" };
    }

    const isPdfType = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfType) {
      return { valid: false, error: "Only PDF documents are allowed (.pdf)" };
    }

    return { valid: true };
  }

  /**
   * Upload and attach a compliance document to a campaign.
   */
  public async uploadDocument(
    input: UploadComplianceDocumentInput,
  ): Promise<ComplianceDocument> {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error("Document title or display name is required");
    }

    const validation = this.validateFile({
      size: input.fileSize,
      type: input.mimeType,
      name: input.fileName,
    });
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Verify campaign exists if campaignService is reachable
    const campaign = await getCampaign(input.campaignId).catch(() => null);
    if (!campaign) {
      // If running with standard or mocked data source, check campaign existence
      // If not found, throw error
      throw new Error("Campaign not found");
    }

    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const now = Date.now();

    const document: ComplianceDocument = {
      id: docId,
      campaignId: input.campaignId,
      name: input.name.trim(),
      fileName: input.fileName.trim(),
      fileUrl: input.fileUrl.trim(),
      fileSize: input.fileSize,
      mimeType: "application/pdf",
      documentType: input.documentType || "other",
      uploadedAt: now,
      uploadedBy: input.uploadedBy.trim(),
      verified: false,
      notes: input.notes?.trim(),
    };

    const existing = this.documents.get(input.campaignId) || [];
    existing.push(document);
    this.documents.set(input.campaignId, existing);

    return document;
  }

  /**
   * List all compliance documents attached to a campaign.
   */
  public async getDocuments(campaignId: string): Promise<ComplianceDocument[]> {
    return this.documents.get(campaignId) || [];
  }

  /**
   * Mark a compliance document as verified by platform admin.
   */
  public async verifyDocument(
    input: VerifyComplianceDocumentInput,
  ): Promise<ComplianceDocument> {
    const docs = this.documents.get(input.campaignId);
    if (!docs) {
      throw new Error("No documents found for this campaign");
    }

    const docIndex = docs.findIndex((d) => d.id === input.documentId);
    if (docIndex === -1) {
      throw new Error("Compliance document not found");
    }

    const now = Date.now();
    const doc = docs[docIndex];
    const updated: ComplianceDocument = {
      ...doc,
      verified: input.verified,
      verifiedAt: input.verified ? now : undefined,
      verifiedBy: input.verified ? input.adminAddress.trim() : undefined,
      notes: input.notes ? input.notes.trim() : doc.notes,
    };

    docs[docIndex] = updated;
    this.documents.set(input.campaignId, docs);

    return updated;
  }

  /**
   * Reset in-memory documents (useful for tests).
   */
  public clearAll() {
    this.documents.clear();
  }
}

export const campaignComplianceService = new CampaignComplianceService();
