export const VERIFICATION_EVENT_TYPES = [
  "submitted_for_review",
  "verifier_comment",
  "photo_uploaded",
  "approved",
  "rejected",
] as const;

export type VerificationEventType = (typeof VERIFICATION_EVENT_TYPES)[number];

export interface VerificationEvidence {
  id: string;
  campaignId: string;
  type: "photo" | "video";
  url: string;
  capturedAt: number;
  uploadedAt: number;
  latitude?: number;
  longitude?: number;
  verifierId?: string;
  caption?: string;
  contentHash?: string;
}

export interface VerificationAuditEntry {
  id: string;
  campaignId: string;
  eventType: VerificationEventType;
  actorId: string;
  occurredAt: number;
  comment?: string;
  evidenceId?: string;
  evidenceUrl?: string;
  previousHash: string | null;
  entryHash: string;
  blockchainTxHash: string;
  ledgerSequence?: number;
}

export interface AppendVerificationEventInput {
  eventType: VerificationEventType;
  actorId: string;
  occurredAt?: number;
  comment?: string;
  evidenceId?: string;
  evidenceUrl?: string;
  blockchainTxHash?: string;
  ledgerSequence?: number;
}
