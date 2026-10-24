import type { CampaignLiveStream, LiveStreamPlatform, LiveStreamStatus } from "@/lib/live-stream";

/** Response of GET /api/campaigns/[id]/stream. */
export interface CampaignStreamConfigResponse {
  campaignId: string;
  /** Creator address allowed to manage the stream. */
  creator: string;
  liveStream: CampaignLiveStream | null;
}

/** Stream fields embedded in the status response. */
export interface CampaignStreamSummary {
  platform: LiveStreamPlatform;
  streamUrl: string;
  replayUrl: string | null;
  title: string | null;
}

/** Response of GET /api/campaigns/[id]/stream-status. */
export interface CampaignStreamStatusResponse {
  campaignId: string;
  liveStream: CampaignStreamSummary | null;
  /** `null` when no stream is configured. */
  status: LiveStreamStatus | null;
  checkedAt: number | null;
  source: string | null;
  reason?: string | null;
}

/** Mutation payload of PUT /api/campaigns/[id]/stream. */
export interface CampaignStreamUpdateRequest {
  streamUrl: string;
  replayUrl?: string;
  title?: string;
  /** Connected wallet address; must equal the campaign creator. */
  requestedBy: string;
}
