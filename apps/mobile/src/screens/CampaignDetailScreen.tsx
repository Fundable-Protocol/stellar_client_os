/**
 * CampaignDetailScreen
 *
 * React Native screen for campaign details with:
 *   - Live-updating tree counter
 *   - Sponsor list
 *   - Verification progress bar
 *   - Real-time updates via WebSocket (issue #848)
 *
 * Navigation param: { campaignId: string }
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import {
  WishlistSyncEngine,
  bindSyncOnReconnect,
  createConnectivityMonitor,
  createManualConnectivitySource,
  getOfflineServices,
} from "../offline";
import {
  CampaignDetail,
  CampaignMilestone,
  CampaignRealtimeClient,
  Sponsor,
  computeSustainabilityScore,
  progressPercent,
  reducer,
  scoreColor,
  scoreLabel,
  shortAddress,
} from "../realtime";

export type { CampaignDetail, Sponsor, CampaignMilestone };
export { computeSustainabilityScore, progressPercent, shortAddress };

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
  subscriberAddress: string,
): Promise<string | null> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status === "undetermined") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return null;

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;
    const response = await fetch(`${apiBaseUrl}/api/mobile/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriberAddress,
        campaignId: "*",
        endpoint: token,
        deviceType: Platform.OS === "ios" ? "mobile_ios" : "mobile_android",
      }),
    });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      throw new Error(result.error ?? `Push registration failed with HTTP ${response.status}`);
    }
    return token;
  } catch (error) {
    console.error("Unable to register mobile push notifications.", error);
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

/**
 * Apply a wishlist mutation on the server. Used by the offline sync engine
 * when connectivity is restored.
 */
async function pushWishlistRemote(
  apiBaseUrl: string,
  campaignId: string,
  action: "add" | "remove",
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}/wishlist`, {
    method: action === "add" ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  /** Connected wallet address used to associate push notifications with the backer. */
  subscriberAddress: string;
  /** Base URL of the API (e.g. "https://app.fundable.com"). */
  apiBaseUrl: string;
  /** WebSocket URL (e.g. "wss://app.fundable.com/ws"). */
  wsUrl?: string;
}

/**
 * CampaignDetailScreen — issue #848
 *
 * Connects to the WebSocket at `wsUrl` and subscribes to the campaign channel
 * with `{ type: "subscribe", campaignId }`. Handles server-pushed real-time updates:
 *   - `tree_planted`          — updates the tree counter with pulse animation
 *   - `new_sponsor`           — prepends a new sponsor row de-duplicated by id
 *   - `verification_update`   — updates verification progress bar smoothly
 *   - `campaign_update`       — merges a partial campaign patch
 *   - `milestone`             — triggers local push notifications
 */
export default function CampaignDetailScreen({
  campaignId,
  subscriberAddress,
  apiBaseUrl,
  wsUrl = "",
}: CampaignDetailScreenProps) {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const [inWishlist, setInWishlist] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const treeAnim          = useRef(new Animated.Value(1)).current;
  const seenMilestonesRef = useRef<Set<string>>(new Set());

  // Offline services: persisted campaign cache + wishlist + sync queue.
  const services = useMemo(() => getOfflineServices(), []);
  const connectivity = useMemo(
    () => createConnectivityMonitor(createManualConnectivitySource()),
    [],
  );
  const syncEngine = useMemo(
    () =>
      new WishlistSyncEngine({
        wishlist: services.wishlist,
        queue: services.queue,
        remote: {
          add: (id) => pushWishlistRemote(apiBaseUrl, id, "add"),
          remove: (id) => pushWishlistRemote(apiBaseUrl, id, "remove"),
        },
      }),
    [services, apiBaseUrl],
  );

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
    registerForPushNotifications(apiBaseUrl, subscriberAddress).then((token) => {
      if (cancelled) return;
      void token;
    });
    return () => { cancelled = true; };
  }, [apiBaseUrl, subscriberAddress]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const deepLinkUrl = response.notification.request.content.data.deepLinkUrl;
      if (typeof deepLinkUrl === "string") {
        Linking.openURL(deepLinkUrl).catch((error: unknown) => {
          console.error("Unable to open the campaign notification link.", error);
        });
      }
    });
    return () => subscription.remove();
  }, []);

  // ── Fetch campaign data (network first, cached fallback) ───────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await services.repository.loadDetail(campaignId, async () => {
          const res = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as CampaignDetail;
        });
        if (!cancelled) {
          dispatch({ type: "LOADED", campaign: result.data, fromCache: result.fromCache });
        }
      } catch (err) {
        if (!cancelled)
          dispatch({ type: "LOAD_ERROR", message: err instanceof Error ? err.message : "Failed to load campaign" });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [campaignId, apiBaseUrl, services, reloadToken]);

  // ── Offline wishlist membership + mutations ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    services.wishlist.has(campaignId).then((value) => {
      if (!cancelled) setInWishlist(value);
    });
    return () => { cancelled = true; };
  }, [services, campaignId]);

  const toggleWishlist = useCallback(() => {
    const next = !inWishlist;
    setInWishlist(next);
    const mutation = next ? syncEngine.add(campaignId) : syncEngine.remove(campaignId);
    // The mutation is persisted locally; failures stay queued for reconnect.
    mutation.catch(() => {});
  }, [inWishlist, campaignId, syncEngine]);

  // ── Flush queued wishlist mutations when connectivity returns ──────────────
  useEffect(() => {
    return bindSyncOnReconnect(connectivity, {
      engine: syncEngine,
      onReconnect: () => setReloadToken((token) => token + 1),
    });
  }, [connectivity, syncEngine]);

  // ── WebSocket real-time updates (issue #848) ───────────────────────────────
  useEffect(() => {
    if (!wsUrl || state.status !== "ready") return;

    const client = new CampaignRealtimeClient({
      wsUrl,
      campaignId,
      onOpen: () => {
        dispatch({ type: "WS_CONNECTED" });
        connectivity.setOnline(true);
      },
      onClose: () => {
        dispatch({ type: "WS_DISCONNECTED" });
        connectivity.setOnline(false);
      },
      onTreePlanted: (treeCount) => {
        dispatch({ type: "TREE_PLANTED", treeCount });
        pulsTree();
      },
      onNewSponsor: (sponsor) => {
        dispatch({ type: "NEW_SPONSOR", sponsor });
      },
      onVerificationUpdate: (verificationProgress) => {
        dispatch({ type: "VERIFICATION_UPDATE", verificationProgress });
      },
      onCampaignUpdate: (patch) => {
        dispatch({ type: "CAMPAIGN_UPDATE", patch });
      },
      onMilestone: (milestone) => {
        const key = `${milestone.type}:${milestone.value ?? ""}`;
        if (seenMilestonesRef.current.has(key)) return;
        seenMilestonesRef.current.add(key);
        dispatch({ type: "MILESTONE", milestone });
        presentMilestoneNotification(milestone);
      },
    });

    client.connect();

    return () => {
      client.dispose();
    };
  }, [state.status, wsUrl, campaignId, connectivity, pulsTree]);

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

  const { campaign, connected, offline } = state;
  const fundingPct   = progressPercent(campaign.raisedAmount, campaign.goalAmount);
  const verifyPct    = Math.min(100, Math.max(0, campaign.verificationProgress ?? 0));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTag}>Impact campaign</Text>
        <Text style={styles.headerTitle} numberOfLines={2}>{campaign.name}</Text>
        <View style={styles.headerActions}>
          <View style={[styles.wsBadge, connected ? styles.wsBadgeOn : styles.wsBadgeOff]}>
            <Text style={styles.wsBadgeText}>{connected ? "● Live" : "○ Offline"}</Text>
          </View>
          {offline ? (
            <View style={[styles.wsBadge, styles.cachedBadge]}>
              <Text style={styles.wsBadgeText}>⌁ Cached</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.wishlistButton, inWishlist && styles.wishlistButtonOn]}
            onPress={toggleWishlist}
            accessibilityRole="button"
            accessibilityLabel={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
          >
            <Text
              style={[
                styles.wishlistButtonText,
                inWishlist && styles.wishlistButtonTextOn,
              ]}
            >
              {inWishlist ? "♥ Saved" : "♡ Wishlist"}
            </Text>
          </TouchableOpacity>
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
  headerActions:    { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 },
  wsBadge:          { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  wsBadgeOn:        { backgroundColor: "rgba(26,114,72,0.85)" },
  wsBadgeOff:       { backgroundColor: "rgba(255,255,255,0.18)" },
  cachedBadge:      { backgroundColor: "rgba(184,134,11,0.9)" },
  wsBadgeText:      { color: "#fff", fontSize: 11, fontWeight: "600" },
  wishlistButton:   {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.6)",
  },
  wishlistButtonOn: { backgroundColor: "rgba(255,255,255,0.9)", borderColor: "#fff" },
  wishlistButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  wishlistButtonTextOn: { color: PURPLE },

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
