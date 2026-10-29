/**
 * Real-time campaign data, state machine, and WebSocket subscription manager.
 * Supports live-updating tree counter, sponsor list, verification progress, and
 * milestone push notifications (issue #848).
 */

import type { CampaignDetail, Sponsor } from "../offline/types";

export type { CampaignDetail, Sponsor };

export type CampaignMilestoneType =
  | "trees_planted"
  | "verification_complete"
  | "campaign_finished"
  | "impact_achieved";

export interface CampaignMilestone {
  type: CampaignMilestoneType;
  title: string;
  body: string;
  /** Optional numeric value associated with the milestone (e.g. tree count). */
  value?: number;
}

export type WsMessage =
  | { type: "campaign_update"; payload: Partial<CampaignDetail> }
  | { type: "tree_planted"; payload: { treeCount: number } }
  | { type: "new_sponsor"; payload: Sponsor }
  | { type: "verification_update"; payload: { verificationProgress: number } }
  | { type: "verification_progress"; payload: { verificationProgress: number } }
  | { type: "milestone"; payload: CampaignMilestone }
  | { type: "ping" }
  | { type: "pong" };

// ── State / reducer ───────────────────────────────────────────────────────────

export type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      campaign: CampaignDetail;
      connected: boolean;
      /** True when the campaign was served from the offline cache. */
      offline: boolean;
    };

export type Action =
  | { type: "LOADED"; campaign: CampaignDetail; fromCache?: boolean }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "WS_CONNECTED" }
  | { type: "WS_DISCONNECTED" }
  | { type: "CAMPAIGN_UPDATE"; patch: Partial<CampaignDetail> }
  | { type: "TREE_PLANTED"; treeCount: number }
  | { type: "NEW_SPONSOR"; sponsor: Sponsor }
  | { type: "VERIFICATION_UPDATE"; verificationProgress: number }
  | { type: "MILESTONE"; milestone: CampaignMilestone };

export function reducer(state: ScreenState, action: Action): ScreenState {
  switch (action.type) {
    case "LOADED":
      return {
        status: "ready",
        campaign: action.campaign,
        connected: false,
        offline: action.fromCache ?? false,
      };

    case "LOAD_ERROR":
      return { status: "error", message: action.message };

    case "WS_CONNECTED":
      return state.status === "ready" ? { ...state, connected: true } : state;

    case "WS_DISCONNECTED":
      return state.status === "ready" ? { ...state, connected: false } : state;

    case "CAMPAIGN_UPDATE":
      if (state.status !== "ready") return state;
      return { ...state, campaign: { ...state.campaign, ...action.patch } };

    case "TREE_PLANTED":
      if (state.status !== "ready") return state;
      return {
        ...state,
        campaign: { ...state.campaign, treeCount: action.treeCount },
      };

    case "NEW_SPONSOR": {
      if (state.status !== "ready") return state;
      const already = state.campaign.sponsors.some(
        (s) => s.id === action.sponsor.id,
      );
      if (already) return state;
      return {
        ...state,
        campaign: {
          ...state.campaign,
          sponsorCount: state.campaign.sponsorCount + 1,
          sponsors: [action.sponsor, ...state.campaign.sponsors],
        },
      };
    }

    case "VERIFICATION_UPDATE":
      if (state.status !== "ready") return state;
      return {
        ...state,
        campaign: {
          ...state.campaign,
          verificationProgress: Math.min(
            100,
            Math.max(0, action.verificationProgress),
          ),
        },
      };

    case "MILESTONE":
      // Milestones are surfaced as push notifications; no state change needed.
      return state;

    default:
      return state;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function progressPercent(raised: string, goal: string): number {
  try {
    const g = BigInt(goal);
    if (g === 0n) return 0;
    const r = BigInt(raised);
    const pct = Number((r * 100n) / g);
    return Math.min(100, Math.max(0, pct));
  } catch {
    return 0;
  }
}

/**
 * Compute the campaign sustainability score (0-100) as a weighted average of
 * four environmental indices.
 */
export function computeSustainabilityScore(campaign: {
  treeSpeciesDiversity?: number;
  regionClimateImpact?: number;
  soilHealthImprovement?: number;
  biodiversityPotential?: number;
}): number {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const components: Array<{ value: number; weight: number }> = [
    { value: campaign.treeSpeciesDiversity, weight: 0.3 },
    { value: campaign.regionClimateImpact, weight: 0.25 },
    { value: campaign.soilHealthImprovement, weight: 0.25 },
    { value: campaign.biodiversityPotential, weight: 0.2 },
  ].filter(
    (c): c is { value: number; weight: number } =>
      typeof c.value === "number" && Number.isFinite(c.value),
  );

  if (components.length === 0) return 0;

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = components.reduce(
    (sum, c) => sum + clamp(c.value) * c.weight,
    0,
  );
  return Math.round(weighted / totalWeight);
}

export function scoreColor(score: number): string {
  if (score >= 75) return "#1a7248";
  if (score >= 50) return "#b8860b";
  return "#c0392b";
}

export function scoreLabel(score: number): string {
  if (score >= 75) return "Excellent";
  if (score >= 50) return "Good";
  if (score >= 25) return "Fair";
  return "Low";
}

// ── WebSocket Subscription Manager ───────────────────────────────────────────

export interface RealtimeClientOptions {
  wsUrl: string;
  campaignId: string;
  onOpen?: () => void;
  onClose?: () => void;
  onTreePlanted?: (treeCount: number) => void;
  onNewSponsor?: (sponsor: Sponsor) => void;
  onVerificationUpdate?: (progress: number) => void;
  onCampaignUpdate?: (patch: Partial<CampaignDetail>) => void;
  onMilestone?: (milestone: CampaignMilestone) => void;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
  /** Custom WebSocket factory for testing or non-browser environments. */
  webSocketFactory?: (url: string) => WebSocket;
}

export class CampaignRealtimeClient {
  private ws: WebSocket | null = null;
  private disposed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentDelay: number;
  private readonly maxDelay: number;
  private readonly wsUrl: string;
  private readonly campaignId: string;
  private readonly options: RealtimeClientOptions;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
    this.wsUrl = options.wsUrl;
    this.campaignId = options.campaignId;
    this.currentDelay = options.initialReconnectDelay ?? 1000;
    this.maxDelay = options.maxReconnectDelay ?? 30000;
  }

  public connect(): void {
    if (this.disposed || !this.wsUrl) return;

    const createWs =
      this.options.webSocketFactory ??
      ((url: string) => new WebSocket(url));

    try {
      const ws = createWs(this.wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (this.disposed) return;
        this.currentDelay = this.options.initialReconnectDelay ?? 1000;
        this.options.onOpen?.();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "subscribe", campaignId: this.campaignId }));
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        if (this.disposed) return;
        this.handleMessage(event.data);
      };

      ws.onclose = () => {
        if (this.disposed) return;
        this.options.onClose?.();
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        if (this.disposed) return;
        this.options.onClose?.();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  public handleMessage(data: unknown): void {
    let msg: unknown;
    try {
      msg = typeof data === "string" ? JSON.parse(data) : data;
    } catch {
      return;
    }

    if (!msg || typeof msg !== "object" || !("type" in msg)) return;
    const message = msg as Partial<WsMessage>;

    switch (message.type) {
      case "campaign_update":
        if (message.payload && typeof message.payload === "object") {
          this.options.onCampaignUpdate?.(message.payload);
        }
        break;

      case "tree_planted":
        if (
          message.payload &&
          "treeCount" in message.payload &&
          typeof message.payload.treeCount === "number" &&
          Number.isFinite(message.payload.treeCount)
        ) {
          this.options.onTreePlanted?.(message.payload.treeCount);
        }
        break;

      case "new_sponsor":
        if (
          message.payload &&
          "id" in message.payload &&
          typeof message.payload.id === "string"
        ) {
          this.options.onNewSponsor?.(message.payload as Sponsor);
        }
        break;

      case "verification_update":
      case "verification_progress":
        if (
          message.payload &&
          "verificationProgress" in message.payload &&
          typeof message.payload.verificationProgress === "number" &&
          Number.isFinite(message.payload.verificationProgress)
        ) {
          this.options.onVerificationUpdate?.(message.payload.verificationProgress);
        }
        break;

      case "milestone": {
        const milestone = message.payload as CampaignMilestone | undefined;
        if (milestone && typeof milestone.type === "string") {
          this.options.onMilestone?.(milestone);
        }
        break;
      }

      case "ping":
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "pong" }));
        }
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disposed) {
        this.connect();
      }
    }, this.currentDelay);

    this.currentDelay = Math.min(this.currentDelay * 2, this.maxDelay);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
  }
}
