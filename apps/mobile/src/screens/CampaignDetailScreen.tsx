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
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";

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
  /** Tree species diversity score (0-100). */
  treeSpeciesDiversity?: number;
  /** Region climate impact score (0-100). */
  regionClimateImpact?: number;
  /** Soil health improvement score (0-100). */
  soilHealthImprovement?: number;
  /** Biodiversity potential score (0-100). */
  biodiversityPotential?: number;
}

type WsMessage =
  | { type: "campaign_update"; payload: Partial<CampaignDetail> }
  | { type: "tree_planted";    payload: { treeCount: number } }
  | { type: "new_sponsor";     payload: Sponsor }
  | { type: "milestone";       payload: CampaignMilestone }
  | { type: "ping" };

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
  | { type: "NEW_SPONSOR";     sponsor: Sponsor }
  | { type: "MILESTONE";       milestone: CampaignMilestone };

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

    case "MILESTONE":
      // Milestones are surfaced as push notifications; no state change needed.
      return state;

    default:
      return state;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ── Push notifications ────────────────────────────────────────────────────────

/**
 * Configure the notification handler once at module load so that milestone
 * notifications are displayed while the app is foregrounded.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions and register a push token with the backend.
 * Returns the Expo push token when granted, otherwise `null`.
 */
async function registerForPushNotifications(
  apiBaseUrl: string,
  campaignId: string,
): Promise<string | null> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;

    // Best-effort registration; failures must not break the screen.
    try {
      await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/push-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, platform: Platform.OS }),
      });
    } catch {
      // ignore network errors during registration
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Present a local push notification for a campaign milestone.
 */
async function presentMilestoneNotification(
  milestone: CampaignMilestone,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: milestone.title,
        body: milestone.body,
        data: { type: milestone.type, value: milestone.value ?? null },
        sound: true,
      },
      trigger: null,
    });
  } catch {
    // Notification failures should never crash the screen.
  }
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

/**
 * Compute the campaign sustainability score (0-100) as a weighted average of
 * four environmental indices. Missing indices default to 0 and are excluded
 * from the weighting so partial data still yields a meaningful score.
 */
export function computeSustainabilityScore(campaign: {
  treeSpeciesDiversity?: number;
  regionClimateImpact?: number;
  soilHealthImprovement?: number;
  biodiversityPotential?: number;
}): number {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const components: Array<{ value: number; weight: number }> = [
    { value: campaign.treeSpeciesDiversity,   weight: 0.3 },
    { value: campaign.regionClimateImpact,    weight: 0.25 },
    { value: campaign.soilHealthImprovement,  weight: 0.25 },
    { value: campaign.biodiversityPotential,  weight: 0.2 },
  ].filter((c): c is { value: number; weight: number } =>
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

function scoreColor(score: number): string {
  if (score >= 75) return "#1a7248";
  if (score >= 50) return "#b8860b";
  return "#c0392b";
}

function scoreLabel(score: number): string {
  if (score >= 75) return "Excellent";
  if (score >= 50) return "Good";
  if (score >= 25) return "Fair";
  return "Low";
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

function SustainabilityScore({
  treeSpeciesDiversity,
  regionClimateImpact,
  soilHealthImprovement,
  biodiversityPotential,
}: {
  treeSpeciesDiversity?: number;
  regionClimateImpact?: number;
  soilHealthImprovement?: number;
  biodiversityPotential?: number;
}) {
  const score = computeSustainabilityScore({
    treeSpeciesDiversity,
    regionClimateImpact,
    soilHealthImprovement,
    biodiversityPotential,
  });
  const color = scoreColor(score);

  const metrics: Array<{ label: string; value?: number }> = [
    { label: "Tree species diversity", value: treeSpeciesDiversity },
    { label: "Region climate impact",  value: regionClimateImpact },
    { label: "Soil health improvement", value: soilHealthImprovement },
    { label: "Biodiversity potential", value: biodiversityPotential },
  ];

  return (
    <View style={styles.sustainCard}>
      <View style={styles.sustainHeader}>
        <Text style={styles.sustainTitle}>Sustainability score</Text>
        <View style={[styles.sustainBadge, { backgroundColor: color }]}>
          <Text style={styles.sustainBadgeText}>{scoreLabel(score)}</Text>
        </View>
      </View>
      <View style={styles.sustainScoreRow}>
        <Text style={[styles.sustainScore, { color }]}>{score}</Text>
        <Text style={styles.sustainScoreMax}>/ 100</Text>
      </View>
      <View style={styles.sustainTrack}>
        <View style={[styles.sustainFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>
      <View style={styles.sustainMetrics}>
        {metrics.map((m) => (
          <View key={m.label} style={styles.sustainMetricRow}>
            <Text style={styles.sustainMetricLabel}>{m.label}</Text>
            <Text style={styles.sustainMetricValue}>
              {typeof m.value === "number" && Number.isFinite(m.value)
                ? `${Math.round(Math.min(100, Math.max(0, m.value)))}`
                : "—"}
            </Text>
          </View>
        ))}
      </View>
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
  const seenMilestonesRef = useRef<Set<string>>(new Set());

  // Pulse animation triggered on each tree_planted event
  const pulsTree = useCallback(() => {
    Animated.sequence([
      Animated.timing(treeAnim, { toValue: 1.35, duration: 180, useNativeDriver: true }),
      Animated.timing(treeAnim, { toValue: 1,    duration: 180, useNativeDriver: true }),
    ]).start();
  }, [treeAnim]);

  // ── Register for push notifications ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    registerForPushNotifications(apiBaseUrl, campaignId).then((token) => {
      if (cancelled) return;
      // Token is registered server-side; nothing else to do here.
      void token;
    });
    return () => { cancelled = true; };
  }, [apiBaseUrl, campaignId]);

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
    let disposed = false;

    ws.onopen = () => {
      if (disposed) return;
      dispatch({ type: "WS_CONNECTED" });
      ws.send(JSON.stringify({ type: "subscribe", campaignId }));
    };

    ws.onmessage = (event) => {
      let msg: unknown;
      try { msg = JSON.parse(event.data as string); }
      catch { return; }
      if (!msg || typeof msg !== "object" || !("type" in msg)) return;
      const message = msg as Partial<WsMessage>;

      switch (message.type) {
        case "campaign_update":
          if (message.payload && typeof message.payload === "object") {
            dispatch({ type: "CAMPAIGN_UPDATE", patch: message.payload });
          }
          break;
        case "tree_planted":
          if (message.payload && "treeCount" in message.payload && Number.isFinite(message.payload.treeCount)) {
            dispatch({ type: "TREE_PLANTED", treeCount: message.payload.treeCount });
            pulsTree();
          }
          break;
        case "new_sponsor":
          if (message.payload && "id" in message.payload && typeof message.payload.id === "string") {
            dispatch({ type: "NEW_SPONSOR", sponsor: message.payload as Sponsor });
          }
          break;
        case "milestone": {
          const milestone = message.payload as CampaignMilestone | undefined;
          if (!milestone || typeof milestone.type !== "string") break;
          const key = `${milestone.type}:${milestone.value ?? ""}`;
          if (seenMilestonesRef.current.has(key)) break;
          seenMilestonesRef.current.add(key);
          dispatch({ type: "MILESTONE", milestone });
          presentMilestoneNotification(milestone);
          break;
        }
        case "ping":
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pong" }));
          break;
      }
    };

    ws.onclose  = () => { if (!disposed) dispatch({ type: "WS_DISCONNECTED" }); };
    ws.onerror  = () => { if (!disposed) dispatch({ type: "WS_DISCONNECTED" }); };

    return () => {
      disposed = true;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
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

        {/* Sustainability score */}
        <SustainabilityScore
          treeSpeciesDiversity={campaign.treeSpeciesDiversity}
          regionClimateImpact={campaign.regionClimateImpact}
          soilHealthImprovement={campaign.soilHealthImprovement}
          biodiversityPotential={campaign.biodiversityPotential}
        />

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

  // Sustainability score
  sustainCard:        {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: "#e4e0f0", marginBottom: 20,
  },
  sustainHeader:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sustainTitle:       { fontSize: 14, fontWeight: "700", color: "#1a1a28" },
  sustainBadge:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  sustainBadgeText:   { color: "#fff", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  sustainScoreRow:    { flexDirection: "row", alignItems: "flex-end", marginTop: 8 },
  sustainScore:       { fontSize: 40, fontWeight: "800", lineHeight: 44 },
  sustainScoreMax:    { fontSize: 14, color: "#6b6b80", marginLeft: 4, marginBottom: 6 },
  sustainTrack:       { height: 8, backgroundColor: "#e4e0f0", borderRadius: 4, overflow: "hidden", marginTop: 8 },
  sustainFill:        { height: "100%", borderRadius: 4 },
  sustainMetrics:     { marginTop: 12, gap: 6 },
  sustainMetricRow:   { flexDirection: "row", justifyContent: "space-between" },
  sustainMetricLabel: { fontSize: 12, color: "#6b6b80" },
  sustainMetricValue: { fontSize: 12, color: "#1a1a28", fontWeight: "600" },

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
