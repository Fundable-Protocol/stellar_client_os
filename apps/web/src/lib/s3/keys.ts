import { randomUUID } from "node:crypto";
import { MAX_KEY_LENGTH, type AllowedContentType } from "./presigner";

/**
 * Build a safe, namespaced object key for a milestone proof photo.
 *
 * The key is derived entirely from server-side input (campaign/milestone ids
 * and a generated UUID) plus a validated content type, so user-supplied file
 * names never reach the S3 key and cannot traverse directories.
 *
 * @param campaignId on-chain campaign / stream id (numeric string)
 * @param milestoneId milestone index within the campaign
 * @param contentType validated MIME type used to derive the file extension
 */
export function buildEvidenceKey(
  campaignId: string,
  milestoneId: string,
  contentType: AllowedContentType,
): string {
  const ext = extensionForContentType(contentType);
  const normalizedCampaign = String(campaignId).replace(/[^a-zA-Z0-9_-]/g, "");
  const normalizedMilestone = String(milestoneId).replace(/[^a-zA-Z0-9_-]/g, "");
  const key = `evidence/${normalizedCampaign}/${normalizedMilestone}/${randomUUID()}.${ext}`;

  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Generated evidence key exceeds max length (${MAX_KEY_LENGTH})`);
  }
  return key;
}

const EXTENSIONS: Record<AllowedContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/**
 * Build an object key for an image attached to a campaign update post.
 *
 * Same guarantees as {@link buildEvidenceKey}: the key is derived from
 * server-side input plus a generated UUID, so user-supplied file names never
 * reach the key and cannot traverse directories.
 *
 * @param campaignId campaign the update belongs to
 * @param updateId update the image belongs to
 * @param contentType validated MIME type used to derive the file extension
 */
export function buildCampaignUpdateKey(
  campaignId: string,
  updateId: string,
  contentType: AllowedContentType,
): string {
  const ext = extensionForContentType(contentType);
  const normalizedCampaign = String(campaignId).replace(/[^a-zA-Z0-9_-]/g, "");
  const normalizedUpdate = String(updateId).replace(/[^a-zA-Z0-9_-]/g, "");
  const key = `updates/${normalizedCampaign}/${normalizedUpdate}/${randomUUID()}.${ext}`;

  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Generated update key exceeds max length (${MAX_KEY_LENGTH})`);
  }
  return key;
}

export function extensionForContentType(contentType: AllowedContentType): string {
  return EXTENSIONS[contentType];
}
