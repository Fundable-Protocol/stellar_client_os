export type VerificationActivityType =
  | 'submitted_for_review'
  | 'verifier_comments'
  | 'photo_uploaded'
  | 'approved'
  | 'rejected';

export type VerificationStatus =
  | 'unsubmitted'
  | 'under_review'
  | 'approved'
  | 'rejected';

export interface VerificationAuditEntry {
  id: number;
  campaignId: string;
  activityType: VerificationActivityType;
  actor: string;
  details: string;
  timestamp: number; // Unix timestamp in seconds
  txHash?: string; // On-chain transaction hash if committed to blockchain
}

export interface VerificationAuditTrail {
  campaignId: string;
  status: VerificationStatus;
  totalActivities: number;
  activities: VerificationAuditEntry[];
  lastUpdated: string;
}
