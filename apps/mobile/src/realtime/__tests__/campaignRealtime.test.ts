import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  Action,
  CampaignDetail,
  CampaignMilestone,
  CampaignRealtimeClient,
  ScreenState,
  Sponsor,
  computeSustainabilityScore,
  progressPercent,
  reducer,
  scoreColor,
  scoreLabel,
  shortAddress,
} from "../campaignRealtime";

describe("CampaignRealtime — Reducer", () => {
  const mockCampaign: CampaignDetail = {
    id: "camp-123",
    name: "Amazon Reforestation",
    description: "Planting trees across the basin",
    status: "active",
    goalAmount: "100000",
    raisedAmount: "50000",
    treeCount: 500,
    sponsorCount: 10,
    location: "Brazil",
    sponsors: [
      {
        id: "sp-1",
        address: "GBJNDSUWLF77X4V5A3LNZ4G4776D3W26UGJTXGUSUYR5X3G4N6N3W5O2",
        amount: "5000",
        token: "XLM",
        sponsoredAt: 1700000000000,
      },
    ],
    verificationProgress: 45,
    treeSpeciesDiversity: 80,
    regionClimateImpact: 75,
    soilHealthImprovement: 70,
    biodiversityPotential: 85,
  };

  it("handles LOADED action correctly from network", () => {
    const initialState: ScreenState = { status: "loading" };
    const action: Action = {
      type: "LOADED",
      campaign: mockCampaign,
      fromCache: false,
    };
    const nextState = reducer(initialState, action);

    expect(nextState).toEqual({
      status: "ready",
      campaign: mockCampaign,
      connected: false,
      offline: false,
    });
  });

  it("handles LOADED action correctly from offline cache", () => {
    const initialState: ScreenState = { status: "loading" };
    const action: Action = {
      type: "LOADED",
      campaign: mockCampaign,
      fromCache: true,
    };
    const nextState = reducer(initialState, action);

    expect(nextState).toEqual({
      status: "ready",
      campaign: mockCampaign,
      connected: false,
      offline: true,
    });
  });

  it("handles LOAD_ERROR action", () => {
    const initialState: ScreenState = { status: "loading" };
    const action: Action = { type: "LOAD_ERROR", message: "Network unavailable" };
    const nextState = reducer(initialState, action);

    expect(nextState).toEqual({
      status: "error",
      message: "Network unavailable",
    });
  });

  it("handles WS_CONNECTED and WS_DISCONNECTED transitions", () => {
    const readyState: ScreenState = {
      status: "ready",
      campaign: mockCampaign,
      connected: false,
      offline: false,
    };

    const connectedState = reducer(readyState, { type: "WS_CONNECTED" });
    expect(connectedState).toEqual({
      ...readyState,
      connected: true,
    });

    const disconnectedState = reducer(connectedState, {
      type: "WS_DISCONNECTED",
    });
    expect(disconnectedState).toEqual({
      ...readyState,
      connected: false,
    });
  });

  it("updates tree count via TREE_PLANTED", () => {
    const readyState: ScreenState = {
      status: "ready",
      campaign: mockCampaign,
      connected: true,
      offline: false,
    };

    const nextState = reducer(readyState, {
      type: "TREE_PLANTED",
      treeCount: 520,
    });

    if (nextState.status === "ready") {
      expect(nextState.campaign.treeCount).toBe(520);
    } else {
      throw new Error("Expected ready state");
    }
  });

  it("adds a new sponsor and increments sponsorCount via NEW_SPONSOR", () => {
    const readyState: ScreenState = {
      status: "ready",
      campaign: mockCampaign,
      connected: true,
      offline: false,
    };

    const newSponsor: Sponsor = {
      id: "sp-2",
      address: "GAYOLLA55DAE5GLV72J7NZSA2R4YXB6XE3RPIS2UMS5SNDCGVNTHW7W5",
      amount: "2500",
      token: "USDC",
      sponsoredAt: 1700000050000,
    };

    const nextState = reducer(readyState, {
      type: "NEW_SPONSOR",
      sponsor: newSponsor,
    });

    if (nextState.status === "ready") {
      expect(nextState.campaign.sponsorCount).toBe(11);
      expect(nextState.campaign.sponsors[0]).toEqual(newSponsor);
      expect(nextState.campaign.sponsors).toHaveLength(2);
    } else {
      throw new Error("Expected ready state");
    }
  });

  it("deduplicates new sponsor if already present", () => {
    const readyState: ScreenState = {
      status: "ready",
      campaign: mockCampaign,
      connected: true,
      offline: false,
    };

    const duplicateSponsor: Sponsor = {
      ...mockCampaign.sponsors[0],
      amount: "9999",
    };

    const nextState = reducer(readyState, {
      type: "NEW_SPONSOR",
      sponsor: duplicateSponsor,
    });

    if (nextState.status === "ready") {
      expect(nextState.campaign.sponsorCount).toBe(10);
      expect(nextState.campaign.sponsors).toHaveLength(1);
    } else {
      throw new Error("Expected ready state");
    }
  });

  it("updates verification progress and clamps between 0 and 100 via VERIFICATION_UPDATE", () => {
    const readyState: ScreenState = {
      status: "ready",
      campaign: mockCampaign,
      connected: true,
      offline: false,
    };

    const updated = reducer(readyState, {
      type: "VERIFICATION_UPDATE",
      verificationProgress: 85,
    });

    if (updated.status === "ready") {
      expect(updated.campaign.verificationProgress).toBe(85);
    } else {
      throw new Error("Expected ready state");
    }

    // Upper bound clamp
    const upperClamped = reducer(readyState, {
      type: "VERIFICATION_UPDATE",
      verificationProgress: 140,
    });
    if (upperClamped.status === "ready") {
      expect(upperClamped.campaign.verificationProgress).toBe(100);
    }

    // Lower bound clamp
    const lowerClamped = reducer(readyState, {
      type: "VERIFICATION_UPDATE",
      verificationProgress: -25,
    });
    if (lowerClamped.status === "ready") {
      expect(lowerClamped.campaign.verificationProgress).toBe(0);
    }
  });

  it("merges partial campaign fields via CAMPAIGN_UPDATE", () => {
    const readyState: ScreenState = {
      status: "ready",
      campaign: mockCampaign,
      connected: true,
      offline: false,
    };

    const nextState = reducer(readyState, {
      type: "CAMPAIGN_UPDATE",
      patch: {
        raisedAmount: "75000",
        status: "funded",
      },
    });

    if (nextState.status === "ready") {
      expect(nextState.campaign.raisedAmount).toBe("75000");
      expect(nextState.campaign.status).toBe("funded");
      expect(nextState.campaign.name).toBe("Amazon Reforestation");
    } else {
      throw new Error("Expected ready state");
    }
  });

  it("keeps state intact on MILESTONE action", () => {
    const readyState: ScreenState = {
      status: "ready",
      campaign: mockCampaign,
      connected: true,
      offline: false,
    };

    const milestone: CampaignMilestone = {
      type: "trees_planted",
      title: "1,000 Trees Planted!",
      body: "Milestone reached",
      value: 1000,
    };

    const nextState = reducer(readyState, { type: "MILESTONE", milestone });
    expect(nextState).toEqual(readyState);
  });
});

describe("CampaignRealtime — Helpers", () => {
  it("shortAddress formats Stellar public keys properly", () => {
    const address = "GBJNDSUWLF77X4V5A3LNZ4G4776D3W26UGJTXGUSUYR5X3G4N6N3W5O2";
    expect(shortAddress(address)).toBe("GBJNDS…W5O2");
    expect(shortAddress("ABC")).toBe("ABC");
  });

  it("progressPercent calculates percentages accurately", () => {
    expect(progressPercent("50000", "100000")).toBe(50);
    expect(progressPercent("100000", "100000")).toBe(100);
    expect(progressPercent("150000", "100000")).toBe(100); // capped at 100
    expect(progressPercent("0", "100000")).toBe(0);
    expect(progressPercent("50000", "0")).toBe(0); // avoids zero division
    expect(progressPercent("invalid", "100000")).toBe(0);
  });

  it("computeSustainabilityScore computes weighted score and handles missing indices", () => {
    // All 4 metrics present
    const score = computeSustainabilityScore({
      treeSpeciesDiversity: 100,
      regionClimateImpact: 80,
      soilHealthImprovement: 60,
      biodiversityPotential: 40,
    });
    // 100*0.3 + 80*0.25 + 60*0.25 + 40*0.2 = 30 + 20 + 15 + 8 = 73
    expect(score).toBe(73);

    // Partial metrics: renormalizes weights
    const partialScore = computeSustainabilityScore({
      treeSpeciesDiversity: 90,
      regionClimateImpact: 80,
    });
    // weight sum = 0.3 + 0.25 = 0.55
    // weighted sum = 90*0.3 + 80*0.25 = 27 + 20 = 47
    // 47 / 0.55 = 85.45 => 85
    expect(partialScore).toBe(85);

    // Empty indices
    expect(computeSustainabilityScore({})).toBe(0);
  });

  it("scoreColor and scoreLabel return correct thresholds", () => {
    expect(scoreColor(80)).toBe("#1a7248");
    expect(scoreLabel(80)).toBe("Excellent");

    expect(scoreColor(65)).toBe("#b8860b");
    expect(scoreLabel(65)).toBe("Good");

    expect(scoreColor(35)).toBe("#c0392b");
    expect(scoreLabel(35)).toBe("Fair");

    expect(scoreColor(15)).toBe("#c0392b");
    expect(scoreLabel(15)).toBe("Low");
  });
});

describe("CampaignRealtime — CampaignRealtimeClient", () => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;

    readyState = MockWebSocket.OPEN;
    sentMessages: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    send(data: string) {
      this.sentMessages.push(data);
    }

    close() {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.();
    }
  }

  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWs = new MockWebSocket();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects and sends subscription message on open", () => {
    const onOpen = vi.fn();
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      onOpen,
      webSocketFactory: () => mockWs as unknown as WebSocket,
    });

    client.connect();
    mockWs.onopen?.();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(mockWs.sentMessages).toEqual([
      JSON.stringify({ type: "subscribe", campaignId: "camp-123" }),
    ]);

    client.dispose();
  });

  it("handles tree_planted WebSocket messages", () => {
    const onTreePlanted = vi.fn();
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      onTreePlanted,
      webSocketFactory: () => mockWs as unknown as WebSocket,
    });

    client.connect();
    mockWs.onopen?.();

    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "tree_planted",
        payload: { treeCount: 650 },
      }),
    });

    expect(onTreePlanted).toHaveBeenCalledWith(650);
    client.dispose();
  });

  it("handles new_sponsor WebSocket messages", () => {
    const onNewSponsor = vi.fn();
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      onNewSponsor,
      webSocketFactory: () => mockWs as unknown as WebSocket,
    });

    client.connect();
    mockWs.onopen?.();

    const sponsorPayload = {
      id: "sp-99",
      address: "GBJNDSUWLF77X4V5A3LNZ4G4776D3W26UGJTXGUSUYR5X3G4N6N3W5O2",
      amount: "1000",
      token: "USDC",
      sponsoredAt: 1700000000000,
    };

    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "new_sponsor",
        payload: sponsorPayload,
      }),
    });

    expect(onNewSponsor).toHaveBeenCalledWith(sponsorPayload);
    client.dispose();
  });

  it("handles verification_update and verification_progress WebSocket messages", () => {
    const onVerificationUpdate = vi.fn();
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      onVerificationUpdate,
      webSocketFactory: () => mockWs as unknown as WebSocket,
    });

    client.connect();
    mockWs.onopen?.();

    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "verification_update",
        payload: { verificationProgress: 92 },
      }),
    });
    expect(onVerificationUpdate).toHaveBeenCalledWith(92);

    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "verification_progress",
        payload: { verificationProgress: 95 },
      }),
    });
    expect(onVerificationUpdate).toHaveBeenCalledWith(95);

    client.dispose();
  });

  it("handles campaign_update WebSocket messages", () => {
    const onCampaignUpdate = vi.fn();
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      onCampaignUpdate,
      webSocketFactory: () => mockWs as unknown as WebSocket,
    });

    client.connect();
    mockWs.onopen?.();

    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "campaign_update",
        payload: { raisedAmount: "80000" },
      }),
    });

    expect(onCampaignUpdate).toHaveBeenCalledWith({ raisedAmount: "80000" });
    client.dispose();
  });

  it("responds to ping with pong", () => {
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      webSocketFactory: () => mockWs as unknown as WebSocket,
    });

    client.connect();
    mockWs.onopen?.();

    mockWs.onmessage?.({
      data: JSON.stringify({ type: "ping" }),
    });

    expect(mockWs.sentMessages).toContain(JSON.stringify({ type: "pong" }));
    client.dispose();
  });

  it("handles milestone WebSocket messages", () => {
    const onMilestone = vi.fn();
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      onMilestone,
      webSocketFactory: () => mockWs as unknown as WebSocket,
    });

    client.connect();
    mockWs.onopen?.();

    const milestone: CampaignMilestone = {
      type: "trees_planted",
      title: "500 trees planted!",
      body: "Milestone achieved",
    };

    mockWs.onmessage?.({
      data: JSON.stringify({
        type: "milestone",
        payload: milestone,
      }),
    });

    expect(onMilestone).toHaveBeenCalledWith(milestone);
    client.dispose();
  });

  it("schedules reconnect on socket close and reconnects with exponential backoff", () => {
    let connectionAttempts = 0;
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      initialReconnectDelay: 500,
      maxReconnectDelay: 2000,
      webSocketFactory: () => {
        connectionAttempts++;
        mockWs = new MockWebSocket();
        return mockWs as unknown as WebSocket;
      },
    });

    client.connect();
    expect(connectionAttempts).toBe(1);

    // Simulate unexpected socket close
    mockWs.onclose?.();
    expect(connectionAttempts).toBe(1);

    // Fast-forward by initial reconnect delay
    vi.advanceTimersByTime(500);
    expect(connectionAttempts).toBe(2);

    // Second close triggers doubled delay (1000ms)
    mockWs.onclose?.();
    vi.advanceTimersByTime(500);
    expect(connectionAttempts).toBe(2);
    vi.advanceTimersByTime(500);
    expect(connectionAttempts).toBe(3);

    client.dispose();
  });

  it("cleans up resources and halts reconnection on dispose", () => {
    let connectionAttempts = 0;
    const client = new CampaignRealtimeClient({
      wsUrl: "wss://app.fundable.com/ws",
      campaignId: "camp-123",
      initialReconnectDelay: 500,
      webSocketFactory: () => {
        connectionAttempts++;
        mockWs = new MockWebSocket();
        return mockWs as unknown as WebSocket;
      },
    });

    client.connect();
    mockWs.onclose?.();

    client.dispose();
    vi.advanceTimersByTime(1000);

    // No reconnect after dispose
    expect(connectionAttempts).toBe(1);
  });
});
