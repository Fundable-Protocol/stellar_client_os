export const VERIFICATION_EVENT_TYPES = [
  "submitted_for_review",
  "verifier_comment",
  "photo_uploaded",
  "approved",
  "rejected",
  "nonprofit_status_changed",
] as const;

export type VerificationEventType = (typeof VERIFICATION_EVENT_TYPES)[number];

export const NONPROFIT_STATUSES = [
  "NONE",
  "PENDING",
  "VERIFIED",
  "REJECTED",
] as const;

export type NonprofitStatus = (typeof NONPROFIT_STATUSES)[number];

export interface NonprofitRegistration {
  legalName: string;
  registrationNumber: string;
  country: string;
}

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

export interface SetNonprofitStatusInput {
  campaignId: string;
  status: NonprofitStatus;
  actorId: string;
  registration?: NonprofitRegistration;
  comment?: string;
  occurredAt?: number;
  blockchainTxHash?: string;
  ledgerSequence?: number;
}

export interface CampaignNonprofitFields {
  nonprofitStatus: NonprofitStatus;
  nonprofitRegistration?: NonprofitRegistration;
  nonprofitVerifiedAt?: number;
  nonprofitVerifiedBy?: string;
}
```

File: apps/web/src/services/campaign-verification.service.ts

```typescript
import {
  AppendVerificationEventInput,
  CampaignNonprofitFields,
  NonprofitRegistration,
  NonprofitStatus,
  SetNonprofitStatusInput,
  VerificationAuditEntry,
  VerificationEventType,
} from "../types/campaign-verification";

export interface CampaignRecord extends CampaignNonprofitFields {
  id: string;
  [key: string]: unknown;
}

export interface CampaignDataSource {
  getCampaign(campaignId: string): Promise<CampaignRecord | null>;
  updateCampaign(
    campaignId: string,
    patch: Partial<CampaignRecord>,
  ): Promise<CampaignRecord>;
  appendAuditEntry(
    entry: Omit<VerificationAuditEntry, "id" | "entryHash" | "previousHash"> & {
      previousHash?: string | null;
      entryHash?: string;
    },
  ): Promise<VerificationAuditEntry>;
  getLatestAuditEntry(campaignId: string): Promise<VerificationAuditEntry | null>;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function computeEntryHash(parts: Array<string | number | null | undefined>): string {
  const payload = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|");
  // Lightweight deterministic hash; real implementation may delegate to a crypto util.
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }
  return `h_${(hash >>> 0).toString(16)}`;
}

export class CampaignVerificationService {
  constructor(private readonly dataSource: CampaignDataSource) {}

  async appendVerificationEvent(
    input: AppendVerificationEventInput & { campaignId: string },
  ): Promise<VerificationAuditEntry> {
    const occurredAt = input.occurredAt ?? Date.now();
    const latest = await this.dataSource.getLatestAuditEntry(input.campaignId);
    const previousHash = latest?.entryHash ?? null;
    const entryHash = computeEntryHash([
      input.campaignId,
      input.eventType,
      input.actorId,
      occurredAt,
      input.comment,
      input.evidenceId,
      input.evidenceUrl,
      previousHash,
    ]);

    return this.dataSource.appendAuditEntry({
      campaignId: input.campaignId,
      eventType: input.eventType,
      actorId: input.actorId,
      occurredAt,
      comment: input.comment,
      evidenceId: input.evidenceId,
      evidenceUrl: input.evidenceUrl,
      blockchainTxHash: input.blockchainTxHash ?? "",
      ledgerSequence: input.ledgerSequence,
      previousHash,
      entryHash,
    });
  }

  /**
   * Persists the non-profit/charitable flag onto the campaign record and
   * appends a verification audit event. This is the eligibility gate used by
   * tax receipt generation.
   */
  async setNonprofitStatus(
    input: SetNonprofitStatusInput,
  ): Promise<{ campaign: CampaignRecord; auditEntry: VerificationAuditEntry }> {
    const campaign = await this.dataSource.getCampaign(input.campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${input.campaignId}`);
    }

    const occurredAt = input.occurredAt ?? Date.now();
    const registration: NonprofitRegistration | undefined =
      input.registration ?? campaign.nonprofitRegistration;

    if (input.status === "VERIFIED" && !registration) {
      throw new Error(
        "Cannot verify non-profit status without a nonprofitRegistration payload",
      );
    }

    const patch: Partial<CampaignRecord> = {
      nonprofitStatus: input.status,
      nonprofitRegistration: registration,
    };

    if (input.status === "VERIFIED") {
      patch.nonprofitVerifiedAt = occurredAt;
      patch.nonprofitVerifiedBy = input.actorId;
    } else {
      patch.nonprofitVerifiedAt = undefined;
      patch.nonprofitVerifiedBy = undefined;
    }

    const updatedCampaign = await this.dataSource.updateCampaign(
      input.campaignId,
      patch,
    );

    const auditEntry = await this.appendVerificationEvent({
      campaignId: input.campaignId,
      eventType: "nonprofit_status_changed" as VerificationEventType,
      actorId: input.actorId,
      occurredAt,
      comment: input.comment ?? `nonprofitStatus=${input.status}`,
      blockchainTxHash: input.blockchainTxHash,
      ledgerSequence: input.ledgerSequence,
    });

    return { campaign: updatedCampaign, auditEntry };
  }

  /**
   * Returns true when the campaign is eligible for tax receipt generation.
   */
  async isTaxReceiptEligible(campaignId: string): Promise<boolean> {
    const campaign = await this.dataSource.getCampaign(campaignId);
    if (!campaign) {
      return false;
    }
    return (
      campaign.nonprofitStatus === ("VERIFIED" as NonprofitStatus) &&
      !!campaign.nonprofitRegistration
    );
  }
}

export function createCampaignVerificationService(
  dataSource: CampaignDataSource,
): CampaignVerificationService {
  return new CampaignVerificationService(dataSource);
}