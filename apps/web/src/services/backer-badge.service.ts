export type BackerBadgeKey =
  | "FIRST_PLEDGE"
  | "FIVE_CAMPAIGNS"
  | "TEN_CAMPAIGNS"
  | "EARLY_BIRD"
  | "TOP_SUPPORTER"
  | "MILESTONE_VERIFIER"
  | "FIRST_100_BACKERS";

export interface BackerBadgeDefinition {
  key: BackerBadgeKey;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  threshold?: number;
}

export interface BackerActivity {
  address: string;
  pledgeCount: number;
  campaignsBacked: number;
  totalPledged: string;
  firstPledgeAt?: number;
  topSupporter?: boolean;
  earlyBird?: boolean;
  escrowVoter?: boolean;
  first100Backer?: boolean;
}

export interface BackerProfilePrivacy {
  showBadgeShowcase: boolean;
  profilePrivate: boolean;
  updatedAt: number;
}

export interface AwardedBackerBadge extends BackerBadgeDefinition {
  awardedAt: number;
  metadataUri: string;
}

export interface BackerBadgeProfileView {
  activity: BackerActivity;
  badges: AwardedBackerBadge[];
  privacy: BackerProfilePrivacy;
  hidden?: boolean;
  isOwner?: boolean;
}

const DEFAULT_DEFINITIONS: BackerBadgeDefinition[] = [
  { key: "FIRST_PLEDGE", name: "First Pledge", description: "Made a first pledge to a campaign.", icon: "🌱", enabled: true, threshold: 1 },
  {
    key: "FIRST_100_BACKERS",
    name: "First 100 Backers",
    description: "Backed a campaign while it was among the first 100 supporters.",
    icon: "💯",
    enabled: true,
    threshold: 1,
  },
  {
    key: "FIVE_CAMPAIGNS",
    name: "Community Builder",
    description: "Backed five different campaigns.",
    icon: "🌿",
    enabled: true,
    threshold: 5,
  },
  {
    key: "TEN_CAMPAIGNS",
    name: "Ecosystem Champion",
    description: "Backed ten different campaigns.",
    icon: "🏆",
    enabled: true,
    threshold: 10,
  },
  {
    key: "EARLY_BIRD",
    name: "Early Bird",
    description: "Backed a campaign during its first 24 hours.",
    icon: "🐦",
    enabled: true,
    threshold: 1,
  },
  {
    key: "MILESTONE_VERIFIER",
    name: "Milestone Verifier",
    description: "Participated in a milestone escrow vote.",
    icon: "✅",
    enabled: true,
    threshold: 1,
  },
  {
    key: "TOP_SUPPORTER",
    name: "Top Supporter",
    description: "Recognised among a campaign's leading supporters.",
    icon: "⭐",
    enabled: true,
    threshold: 1,
  },
];

function normalize(address: string): string {
  return String(address ?? "").trim().toLowerCase();
}

export function badgeMetadataUri(address: string, badgeKey: BackerBadgeKey): string {
  const base = process.env.NEXT_PUBLIC_URL ?? "https://fundable.network";
  return new URL(
    `/api/backers/${encodeURIComponent(address.trim())}/badges/${badgeKey}/metadata`,
    base,
  ).toString();
}

function defaultPrivacy(now = Date.now()): BackerProfilePrivacy {
  return { showBadgeShowcase: true, profilePrivate: false, updatedAt: now };
}

class BackerBadgeService {
  private definitions = new Map(DEFAULT_DEFINITIONS.map((definition) => [definition.key, { ...definition }]));
  private awarded = new Map<string, Map<BackerBadgeKey, AwardedBackerBadge>>();
  private activity = new Map<string, BackerActivity>();
  private privacy = new Map<string, BackerProfilePrivacy>();

  listDefinitions(): BackerBadgeDefinition[] {
    return Array.from(this.definitions.values()).map((definition) => ({ ...definition }));
  }

  configureDefinitions(definitions: BackerBadgeDefinition[]): BackerBadgeDefinition[] {
    for (const definition of definitions) {
      if (!definition.key || !definition.name.trim() || !definition.description.trim()) {
        throw new Error("Badge key, name, and description are required");
      }
      this.definitions.set(definition.key, { ...definition, name: definition.name.trim(), description: definition.description.trim() });
    }
    return this.listDefinitions();
  }

  getPrivacy(address: string): BackerProfilePrivacy {
    const key = normalize(address);
    return { ...(this.privacy.get(key) ?? defaultPrivacy()) };
  }

  setPrivacy(
    address: string,
    input: Partial<Pick<BackerProfilePrivacy, "showBadgeShowcase" | "profilePrivate">>,
    now = Date.now(),
  ): BackerProfilePrivacy {
    const key = normalize(address);
    if (!key) throw new Error("Backer address is required");
    const current = this.getPrivacy(key);
    const next: BackerProfilePrivacy = {
      showBadgeShowcase: input.showBadgeShowcase ?? current.showBadgeShowcase,
      profilePrivate: input.profilePrivate ?? current.profilePrivate,
      updatedAt: now,
    };
    this.privacy.set(key, next);
    return { ...next };
  }

  recordPledge(input: {
    address: string;
    campaignId: string;
    amount: string;
    campaignCreatedAt?: number;
    pledgedAt?: number;
    campaignBackerRank?: number;
  }): AwardedBackerBadge[] {
    const address = normalize(input.address);
    if (!address) throw new Error("Backer address is required");
    const now = input.pledgedAt ?? Date.now();
    const current = this.activity.get(address) ?? { address, pledgeCount: 0, campaignsBacked: 0, totalPledged: "0" };
    const campaignKey = `${address}:${input.campaignId}`;
    const campaignCountKey = `${campaignKey}:counted`;
    const campaignCounted = this.activity.has(campaignCountKey);
    const first100 =
      current.first100Backer ||
      (input.campaignBackerRank !== undefined && input.campaignBackerRank >= 1 && input.campaignBackerRank <= 100);
    const next: BackerActivity = {
      ...current,
      pledgeCount: current.pledgeCount + 1,
      campaignsBacked: current.campaignsBacked + (campaignCounted ? 0 : 1),
      totalPledged: (BigInt(current.totalPledged) + BigInt(input.amount)).toString(),
      firstPledgeAt: current.firstPledgeAt ?? now,
      earlyBird: current.earlyBird || Boolean(input.campaignCreatedAt && now - input.campaignCreatedAt <= 24 * 60 * 60 * 1000),
      first100Backer: first100,
    };
    this.activity.set(address, next);
    this.activity.set(campaignCountKey, next);
    return this.evaluate(address, now);
  }

  recordEscrowVote(address: string, votedAt = Date.now()): AwardedBackerBadge[] {
    const key = normalize(address);
    if (!key) throw new Error("Backer address is required");
    const current = this.activity.get(key) ?? { address: key, pledgeCount: 0, campaignsBacked: 0, totalPledged: "0" };
    this.activity.set(key, { ...current, escrowVoter: true });
    return this.evaluate(key, votedAt);
  }

  setTopSupporter(address: string, value = true, awardedAt = Date.now()): AwardedBackerBadge[] {
    const key = normalize(address);
    const current = this.activity.get(key) ?? { address: key, pledgeCount: 0, campaignsBacked: 0, totalPledged: "0" };
    this.activity.set(key, { ...current, topSupporter: value });
    return this.evaluate(key, awardedAt);
  }

  evaluate(address: string, now = Date.now()): AwardedBackerBadge[] {
    const key = normalize(address);
    const activity = this.activity.get(key);
    if (!activity) return [];
    const earned = this.awarded.get(key) ?? new Map<BackerBadgeKey, AwardedBackerBadge>();
    const fiveThreshold = this.definitions.get("FIVE_CAMPAIGNS")?.threshold ?? 5;
    const tenThreshold = this.definitions.get("TEN_CAMPAIGNS")?.threshold ?? 10;
    const qualifies: Record<BackerBadgeKey, boolean> = {
      FIRST_PLEDGE: activity.pledgeCount >= 1,
      FIRST_100_BACKERS: Boolean(activity.first100Backer),
      FIVE_CAMPAIGNS: activity.campaignsBacked >= fiveThreshold,
      TEN_CAMPAIGNS: activity.campaignsBacked >= tenThreshold,
      EARLY_BIRD: Boolean(activity.earlyBird),
      MILESTONE_VERIFIER: Boolean(activity.escrowVoter),
      TOP_SUPPORTER: Boolean(activity.topSupporter),
    };
    for (const [badgeKey, qualifiesBadge] of Object.entries(qualifies) as [BackerBadgeKey, boolean][]) {
      const definition = this.definitions.get(badgeKey);
      if (!definition?.enabled || !qualifiesBadge) continue;
      const existing = earned.get(badgeKey);
      if (!existing) {
        earned.set(badgeKey, {
          ...definition,
          awardedAt: now,
          metadataUri: badgeMetadataUri(activity.address, badgeKey),
        });
        continue;
      }
      if (!existing.metadataUri) {
        earned.set(badgeKey, { ...existing, metadataUri: badgeMetadataUri(activity.address, badgeKey) });
      }
    }
    this.awarded.set(key, earned);
    return Array.from(earned.values()).map((badge) => ({ ...badge }));
  }

  getBadgeMetadata(address: string, badgeKey: BackerBadgeKey): Record<string, unknown> | null {
    const key = normalize(address);
    const badge = this.awarded.get(key)?.get(badgeKey);
    if (!badge) return null;
    return {
      name: badge.name,
      description: badge.description,
      image: `https://fundable.network/badges/${badgeKey.toLowerCase()}.png`,
      external_url: badgeMetadataUri(key, badgeKey),
      attributes: [
        { trait_type: "badge_key", value: badge.key },
        { trait_type: "minted_at", value: new Date(badge.awardedAt).toISOString() },
        { trait_type: "backer_address", value: key },
      ],
    };
  }

  getProfile(address: string, viewerAddress?: string): BackerBadgeProfileView {
    const key = normalize(address);
    const viewerKey = viewerAddress ? normalize(viewerAddress) : "";
    const isOwner = Boolean(viewerKey && viewerKey === key);
    const privacy = this.getPrivacy(key);
    const activity = this.activity.get(key) ?? { address: key, pledgeCount: 0, campaignsBacked: 0, totalPledged: "0" };
    const badges = this.evaluate(key);

    if (privacy.profilePrivate && !isOwner) {
      return { activity: { address: key, pledgeCount: 0, campaignsBacked: 0, totalPledged: "0" }, badges: [], privacy, hidden: true, isOwner: false };
    }

    if (!privacy.showBadgeShowcase && !isOwner) {
      return { activity: { ...activity }, badges: [], privacy, isOwner: false };
    }

    return {
      activity: { ...activity },
      badges,
      privacy,
      isOwner,
    };
  }

  reset(): void {
    this.awarded.clear();
    this.activity.clear();
    this.privacy.clear();
    this.definitions = new Map(DEFAULT_DEFINITIONS.map((definition) => [definition.key, { ...definition }]));
  }
}

export const backerBadgeService = new BackerBadgeService();
export { BackerBadgeService };
