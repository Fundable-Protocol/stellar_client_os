import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";
import {
  parseLiveStreamUrl,
  type CampaignLiveStream,
  type LiveStreamPlatform,
} from "@/lib/live-stream";

/**
 * Campaign live-stream management (issue #1225).
 *
 * All writes go through this service so URL validation and the campaign
 * ownership rule are enforced in one place, regardless of which API route or
 * caller triggers the change.
 */

export type CampaignLiveStreamErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION";

export class CampaignLiveStreamError extends Error {
  constructor(
    message: string,
    readonly code: CampaignLiveStreamErrorCode,
  ) {
    super(message);
    this.name = "CampaignLiveStreamError";
  }
}

export interface CampaignLiveStreamInput {
  streamUrl: unknown;
  replayUrl?: unknown;
  title?: unknown;
}

/** Maximum length accepted for a creator-supplied stream title. */
export const MAX_LIVE_STREAM_TITLE_LENGTH = 120;

interface ValidatedLiveStreamInput {
  platform: LiveStreamPlatform;
  streamUrl: string;
  replayUrl?: string;
  title?: string;
}

function validateLiveStreamInput(input: CampaignLiveStreamInput): ValidatedLiveStreamInput {
  const stream = parseLiveStreamUrl(input.streamUrl);
  if (!stream.ok) throw new CampaignLiveStreamError(stream.error, "VALIDATION");

  let replayUrl: string | undefined;
  if (input.replayUrl !== undefined && input.replayUrl !== null && input.replayUrl !== "") {
    const replay = parseLiveStreamUrl(input.replayUrl);
    if (!replay.ok) {
      throw new CampaignLiveStreamError(`Replay URL: ${replay.error}`, "VALIDATION");
    }
    replayUrl = replay.canonicalUrl;
  }

  let title: string | undefined;
  if (input.title !== undefined && input.title !== null && input.title !== "") {
    if (typeof input.title !== "string") {
      throw new CampaignLiveStreamError("Stream title must be a string", "VALIDATION");
    }
    const trimmed = input.title.trim();
    if (trimmed.length > MAX_LIVE_STREAM_TITLE_LENGTH) {
      throw new CampaignLiveStreamError(
        `Stream title must be ${MAX_LIVE_STREAM_TITLE_LENGTH} characters or fewer`,
        "VALIDATION",
      );
    }
    if (trimmed) title = trimmed;
  }

  return {
    platform: stream.platform,
    streamUrl: stream.canonicalUrl,
    replayUrl,
    title,
  };
}

async function loadCampaignForStreamWrite(
  campaignId: string,
  requestedBy: string | null | undefined,
  dataSource: CampaignDataSource,
): Promise<CampaignRecord> {
  if (!requestedBy || !requestedBy.trim()) {
    throw new CampaignLiveStreamError("requestedBy (creator address) is required", "FORBIDDEN");
  }
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new CampaignLiveStreamError("Campaign not found", "NOT_FOUND");
  if (campaign.creator !== requestedBy.trim()) {
    throw new CampaignLiveStreamError(
      "Only the campaign creator can manage the campaign live stream",
      "FORBIDDEN",
    );
  }
  return campaign;
}

/**
 * Create or replace the campaign's live stream metadata. The supplied URLs are
 * re-validated server-side and stored in canonical form; `addedAt` is preserved
 * across updates so the first publication time is never lost.
 */
export async function setCampaignLiveStream(
  campaignId: string,
  requestedBy: string | null | undefined,
  input: CampaignLiveStreamInput,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignRecord> {
  const campaign = await loadCampaignForStreamWrite(campaignId, requestedBy, dataSource);
  const validated = validateLiveStreamInput(input);
  const existing = campaign.liveStream;

  const liveStream: CampaignLiveStream = {
    platform: validated.platform,
    streamUrl: validated.streamUrl,
    ...(validated.replayUrl ? { replayUrl: validated.replayUrl } : {}),
    ...(validated.title ? { title: validated.title } : {}),
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  };

  return dataSource.saveCampaign({ ...campaign, liveStream, updatedAt: now });
}

/**
 * Remove the campaign's live stream metadata. The replay link is therefore
 * removed too — creators who only want to hide a finished broadcast without
 * losing its replay can leave the stream configured instead.
 */
export async function removeCampaignLiveStream(
  campaignId: string,
  requestedBy: string | null | undefined,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignRecord> {
  const campaign = await loadCampaignForStreamWrite(campaignId, requestedBy, dataSource);
  if (!campaign.liveStream) return campaign;

  const { liveStream: _removed, ...rest } = campaign;
  return dataSource.saveCampaign({ ...rest, updatedAt: now });
}
