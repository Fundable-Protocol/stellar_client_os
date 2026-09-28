/**
 * CampaignDetailScreen
 *
 * React Native screen for campaign details with:
 *   - Live-updating tree counter
 *   - Sponsor list
 *   - Verification progress bar
 *   - Real-time updates via WebSocket (issue #984)
 *
 * Navigation param: { campaignId: string }
 */

import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Sponsor {
  id: string;
  address: string;
  amount: string;
  token: string;
  sponsoredAt: number;
}

export interface CampaignDetail {
  id: string;
  name: string;
  description?: string;
  status: string;
  goalAmount: string;
  raisedAmount: string;
  treeCount: number;
  sponsorCount: number;
  location?: string;
  sponsors: Sponsor[];
  /** Percentage of verification steps completed (0-100). */
  verificationProgress: number;
}

type WsMessage =
  | { type: "campaign_update"; payload: Partial<CampaignDetail> }
  | { type: "tree_planted";    payload: { treeCount: number } }
  | { type: "new_sponsor";     payload: Sponsor }
  | { type: "ping" };

// ── State / reducer ───────────────────────────────────────────────────────────

type ScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; campaign: CampaignDetail; connected: boolean };

type Action =
  | { type: "LOADED";          campaign: CampaignDetail }
  | { type: "LOAD_ERROR";      message: string }
  | { type: "WS_CONNECTED" }
  | { type: "WS_DISCONNECTED" }
  | { type: "CAMPAIGN_UPDATE"; patch: Partial<CampaignDetail> }
  | { type: "TREE_PLANTED";    treeCount: number }
  | { type: "NEW_SPONSOR";     sponsor: Sponsor };

function reducer(state: ScreenState, action: Action): ScreenState {
  switch (action.type) {
    case "LOADED":
      return { status: "ready", campaign: action.campaign, connected: false };

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

    default:
      return state;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function progressPercent(raised: string, goal: string): number {
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const widthAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(widthAnim, { toValue: percent, duration: 600, useNativeDriver: false }).start();
  }, [percent, widthAnim]);
  const width = widthAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
  return (
    <View style={styles.progressWrap}>
      <Text style={styles.progressLabel}>{label}</Text>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width }]} />
      </View>
      <Text style={styles.progressPct}>{percent}%</Text>
    </View>
  );
}

function SponsorRow({ item }: { item: Sponsor }) {
  const date = new Date(item.sponsoredAt).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
  return (
    <View style={styles.sponsorRow}>
      <View style={styles.sponsorAvatar}>
        <Text style={styles.sponsorAvatarText}>{item.address.slice(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.sponsorInfo}>
        <Text style={styles.sponsorAddress}>{shortAddress(item.address)}</Text>
        <Text style={styles.sponsorDate}>{date}</Text>
      </View>
      <Text style={styles.sponsorAmount}>
        {item.amount} {item.token}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export interface CampaignDetailScreenProps {
  /** Campaign ID passed from the navigator. */
  campaignId: string;
  /** Base URL of the API (e.g. "https://app.fundable.com"). */
  apiBaseUrl?: string;
  /** WebSocket URL (e.g. "wss://app.fundable.com/ws"). */
  wsUrl?: string;
}

/**
 * CampaignDetailScreen — issue #984
 *
 * Connects to the WebSocket at `wsUrl` and subscribes to the campaign channel
 * with `{ type: "subscribe", campaignId }`.  Handles three server-pushed
 * message types:
 *   - `campaign_update`  — merges a partial campaign patch
 *   - `tree_planted`     — updates the tree counter with a pulse animation
 *   - `new_sponsor`      — prepends a new sponsor row de-duplicated by id
 */
export default function CampaignDetailScreen({
  campaignId,
  apiBaseUrl = "",
  wsUrl = "",
}: CampaignDetailScreenProps) {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const wsRef             = useRef<WebSocket | null>(null);
  const treeAnim          = useRef(new Animated.Value(1)).current;

  // Pulse animation triggered on each tree_planted event
  const pulsTree = useCallback(() => {
    Animated.sequence([
      Animated.timing(treeAnim, { toValue: 1.35, duration: 180, useNativeDriver: true }),
      Animated.timing(treeAnim, { toValue: 1,    duration: 180, useNativeDriver: true }),
    ]).start();
  }, [treeAnim]);

  // ── Fetch initial campaign data ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as CampaignDetail;
        if (!cancelled) dispatch({ type: "LOADED", campaign: data });
      } catch (err) {
        if (!cancelled)
          dispatch({ type: "LOAD_ERROR", message: err instanceof Error ? err.message : "Failed to load campaign" });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [campaignId, apiBaseUrl]);

  // ── WebSocket real-time updates ────────────────────────────────────────────
  useEffect(() => {
    if (!wsUrl || state.status !== "ready") return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      dispatch({ type: "WS_CONNECTED" });
      ws.send(JSON.stringify({ type: "subscribe", campaignId }));
    };

    ws.onmessage = (event) => {
      let msg: WsMessage;
      try { msg = JSON.parse(event.data as string) as WsMessage; }
      catch { return; }

      switch (msg.type) {
        case "campaign_update":
          dispatch({ type: "CAMPAIGN_UPDATE", patch: msg.payload });
          break;
        case "tree_planted":
          dispatch({ type: "TREE_PLANTED", treeCount: msg.payload.treeCount });
          pulsTree();
          break;
        case "new_sponsor":
          dispatch({ type: "NEW_SPONSOR", sponsor: msg.payload });
          break;
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;
      }
    };

    ws.onclose  = () => dispatch({ type: "WS_DISCONNECTED" });
    ws.onerror  = () => dispatch({ type: "WS_DISCONNECTED" });

    return () => {
      ws.close();
      wsRef.current = null;
    };
  // Re-connect when campaign moves from loading → ready, or wsUrl changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, wsUrl, campaignId]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state.status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={PURPLE} />
        <Text style={styles.loadingText}>Loading campaign…</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>⚠ {state.message}</Text>
      </View>
    );
  }

  const { campaign, connected } = state;
  const fundingPct   = progressPercent(campaign.raisedAmount, campaign.goalAmount);
  const verifyPct    = Math.min(100, Math.max(0, campaign.verificationProgress ?? 0));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTag}>Impact campaign</Text>
        <Text style={styles.headerTitle} numberOfLines={2}>{campaign.name}</Text>
        <View style={[styles.wsBadge, connected ? styles.wsBadgeOn : styles.wsBadgeOff]}>
          <Text style={styles.wsBadgeText}>{connected ? "● Live" : "○ Offline"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* Description */}
        {campaign.description ? (
          <Text style={styles.description}>{campaign.description}</Text>
        ) : null}

        {/* Location */}
        {campaign.location ? (
          <Text style={styles.location}>📍 {campaign.location}</Text>
        ) : null}

        {/* Live tree counter */}
        <View style={styles.treeCard}>
          <Animated.Text style={[styles.treeCount, { transform: [{ scale: treeAnim }] }]}>
            {campaign.treeCount.toLocaleString()}
          </Animated.Text>
          <Text style={styles.treeLabel}>trees planted</Text>
        </View>

        {/* Stat cards */}
        <View style={styles.statRow}>
          <StatCard label="Sponsors"  value={campaign.sponsorCount.toLocaleString()} />
          <StatCard label="Raised"    value={campaign.raisedAmount} accent />
          <StatCard label="Goal"      value={campaign.goalAmount} />
        </View>

        {/* Funding progress */}
        <ProgressBar percent={fundingPct} label="Funding progress" />

        {/* Verification progress */}
        <ProgressBar percent={verifyPct} label="Verification progress" />

        {/* Sponsor list */}
        <Text style={styles.sectionTitle}>Sponsors</Text>
        {campaign.sponsors.length === 0 ? (
          <Text style={styles.emptyText}>No sponsors yet — be the first!</Text>
        ) : (
          <FlatList
            data={campaign.sponsors}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <SponsorRow item={item} />}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PURPLE = "#4f2d99";
const GREEN  = "#1a7248";

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: "#f9f9fb" },
  centered:         { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText:      { marginTop: 12, color: "#6b6b80", fontSize: 14 },
  errorText:        { color: "#c0392b", fontSize: 15, textAlign: "center" },

  // Header
  header:           { backgroundColor: PURPLE, paddingTop: 52, paddingBottom: 20, paddingHorizontal: 20 },
  headerTag:        { color: "rgba(255,255,255,0.7)", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  headerTitle:      { color: "#fff", fontSize: 22, fontWeight: "700", marginTop: 4, lineHeight: 28 },
  wsBadge:          { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  wsBadgeOn:        { backgroundColor: "rgba(26,114,72,0.85)" },
  wsBadgeOff:       { backgroundColor: "rgba(255,255,255,0.18)" },
  wsBadgeText:      { color: "#fff", fontSize: 11, fontWeight: "600" },

  body:             { padding: 20, paddingBottom: 40 },
  description:      { fontSize: 14, color: "#3a3a50", lineHeight: 21, marginBottom: 8 },
  location:         { fontSize: 12, color: "#6b6b80", marginBottom: 16 },

  // Tree counter
  treeCard:         {
    backgroundColor: GREEN, borderRadius: 16, alignItems: "center",
    paddingVertical: 28, marginBottom: 16,
  },
  treeCount:        { fontSize: 56, fontWeight: "800", color: "#fff" },
  treeLabel:        { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4, letterSpacing: 0.5 },

  // Stats
  statRow:          { flexDirection: "row", gap: 8, marginBottom: 20 },
  statCard:         {
    flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 12,
    alignItems: "center", borderWidth: 1, borderColor: "#e4e0f0",
  },
  statLabel:        { fontSize: 10, color: "#6b6b80", textTransform: "uppercase", letterSpacing: 0.5 },
  statValue:        { fontSize: 16, fontWeight: "700", color: "#1a1a28", marginTop: 4 },
  statValueAccent:  { color: PURPLE },

  // Progress bars
  progressWrap:     { marginBottom: 16 },
  progressLabel:    { fontSize: 12, color: "#6b6b80", marginBottom: 6 },
  progressTrack:    { height: 8, backgroundColor: "#e4e0f0", borderRadius: 4, overflow: "hidden" },
  progressFill:     { height: "100%", backgroundColor: PURPLE, borderRadius: 4 },
  progressPct:      { fontSize: 11, color: PURPLE, fontWeight: "600", marginTop: 4, textAlign: "right" },

  // Sponsors
  sectionTitle:     { fontSize: 16, fontWeight: "700", color: "#1a1a28", marginBottom: 12, marginTop: 8 },
  emptyText:        { color: "#6b6b80", fontSize: 13, fontStyle: "italic" },
  separator:        { height: 1, backgroundColor: "#f0eef8" },
  sponsorRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 10, backgroundColor: "#fff", paddingHorizontal: 12, borderRadius: 10 },
  sponsorAvatar:    { width: 36, height: 36, borderRadius: 18, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", marginRight: 10 },
  sponsorAvatarText:{ color: "#fff", fontSize: 13, fontWeight: "700" },
  sponsorInfo:      { flex: 1 },
  sponsorAddress:   { fontSize: 13, color: "#1a1a28", fontWeight: "600" },
  sponsorDate:      { fontSize: 11, color: "#6b6b80", marginTop: 2 },
  sponsorAmount:    { fontSize: 13, color: GREEN, fontWeight: "700" },
});