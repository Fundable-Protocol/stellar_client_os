/**
 * Campaign Compliance Documents Types
 *
 * Feature Request: Allow creators to attach compliance documents
 * (business registration, non-profit status, certifications) to their campaign
 * for backer due diligence.
 *
 * Acceptance Criteria:
 * 1. File upload (PDF, max 10 MB) in campaign settings
 * 2. Uploaded documents listed on campaign page with names and upload date
 * 3. Platform admin can mark documents as verified
 */

export type ComplianceDocumentType =
  | "business_registration"
  | "non_profit_status"
  | "certification"
  | "other";

export interface ComplianceDocument {
  id: string;
  campaignId: string;
  name: string; // Document title or display name
  fileName: string; // Original file name (e.g. 501c3_status.pdf)
  fileUrl: string; // URL / path to the document file (or data URI)
  fileSize: number; // File size in bytes (max 10MB = 10,485,760 bytes)
  mimeType: string; // Only "application/pdf" allowed
  documentType: ComplianceDocumentType;
  uploadedAt: number; // Unix timestamp ms
  uploadedBy: string; // Creator address or user ID
  verified: boolean; // Platform admin verification flag
  verifiedAt?: number; // Unix timestamp ms
  verifiedBy?: string; // Admin address or user ID
  notes?: string;
}

export const MAX_COMPLIANCE_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_COMPLIANCE_MIME_TYPES = ["application/pdf"] as const;

export interface UploadComplianceDocumentInput {
  campaignId: string;
  name: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  documentType?: ComplianceDocumentType;
  uploadedBy: string;
  notes?: string;
}

export interface VerifyComplianceDocumentInput {
  campaignId: string;
  documentId: string;
  adminAddress: string;
  verified: boolean;
  notes?: string;
}
