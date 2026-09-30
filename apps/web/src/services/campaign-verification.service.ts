import { createHash } from "node:crypto";
import {
  VERIFICATION_EVENT_TYPES,
  type AppendVerificationEventInput,
  type VerificationAuditEntry,
  type VerificationEventType,
} from "@/types/campaign-verification";
import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
} from "./campaign.service";

export { VERIFICATION_EVENT_TYPES };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateInput(input: AppendVerificationEventInput): void {
  if (!VERIFICATION_EVENT_TYPES.includes(input.eventType)) {
    throw new Error(`Unsupported verification event type: ${input.eventType}`);
  }
  if (!input.actorId?.trim()) throw new Error("actorId is required");
  if (input.comment && input.comment.length > 2_000) throw new Error("comment is too long");
}

/**
 * Appends a verification event. Existing entries are copied and never edited;
 * each new entry commits to the previous hash so consumers can verify the
 * complete audit trail independently. blockchainTxHash is the Soroban/Horizon
 * anchor supplied by the indexer; the local fallback is explicitly marked as
 * pending for development environments without a chain writer.
 */
export async function appendVerificationEvent(
  campaignId: string,
  input: AppendVerificationEventInput,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<VerificationAuditEntry> {
  validateInput(input);
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new Error("Campaign not found");
  const auditTrail = campaign.verificationAuditTrail ?? [];
  const previousHash = auditTrail.at(-1)?.entryHash ?? null;
  const occurredAt = input.occurredAt ?? Date.now();
  const id = `${campaignId}:verification:${occurredAt}:${auditTrail.length}`;
  const canonical = JSON.stringify({
    id,
    campaignId,
    eventType: input.eventType,
    actorId: input.actorId.trim(),
    occurredAt,
    comment: input.comment?.trim() || undefined,
    evidenceId: input.evidenceId,
    evidenceUrl: input.evidenceUrl,
    previousHash,
  });
  const entryHash = sha256(canonical);
  const entry: VerificationAuditEntry = {
    id,
    campaignId,
    eventType: input.eventType,
    actorId: input.actorId.trim(),
    occurredAt,
    ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
    ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
    ...(input.evidenceUrl ? { evidenceUrl: input.evidenceUrl } : {}),
    previousHash,
    entryHash,
    blockchainTxHash: input.blockchainTxHash ?? `pending:${entryHash}`,
    ...(input.ledgerSequence !== undefined ? { ledgerSequence: input.ledgerSequence } : {}),
  };
  await dataSource.saveCampaign({
    ...campaign,
    verificationAuditTrail: [...auditTrail, entry],
    updatedAt: occurredAt,
  });
  return entry;
}

export async function getVerificationAuditTrail(
  campaignId: string,
  dataSource: CampaignDataSource = getCampaignDataSource(),
): Promise<VerificationAuditEntry[] | null> {
  const campaign = await getCampaign(campaignId, dataSource);
  return campaign ? (campaign.verificationAuditTrail ?? []).map((entry) => ({ ...entry })) : null;
}

export function verifyVerificationAuditTrail(entries: readonly VerificationAuditEntry[]): boolean {
  let previousHash: string | null = null;
  for (const entry of entries) {
    const canonical = JSON.stringify({
      id: entry.id,
      campaignId: entry.campaignId,
      eventType: entry.eventType,
      actorId: entry.actorId,
      occurredAt: entry.occurredAt,
      comment: entry.comment,
      evidenceId: entry.evidenceId,
      evidenceUrl: entry.evidenceUrl,
      previousHash,
    });
    if (entry.previousHash !== previousHash || sha256(canonical) !== entry.entryHash) return false;
    previousHash = entry.entryHash;
  }
  return true;
}

export function isVerificationEventType(value: unknown): value is VerificationEventType {
  return typeof value === "string" && (VERIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}
