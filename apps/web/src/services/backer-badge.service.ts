export type BackerBadgeKey = "FIRST_PLEDGE" | "TEN_CAMPAIGNS" | "EARLY_BIRD" | "TOP_SUPPORTER";

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
}

export interface AwardedBackerBadge extends BackerBadgeDefinition {
  awardedAt: number;
}

const DEFAULT_DEFINITIONS: BackerBadgeDefinition[] = [
  { key: "FIRST_PLEDGE", name: "First Pledge", description: "Made a first pledge to a campaign.", icon: "🌱", enabled: true, threshold: 1 },
  { key: "TEN_CAMPAIGNS", name: "Campaign Champion", description: "Backed 10 different campaigns.", icon: "🏆", enabled: true, threshold: 10 },
  { key: "EARLY_BIRD", name: "Early Bird", description: "Backed a campaign during its first 24 hours.", icon: "🐦", enabled: true, threshold: 1 },
  { key: "TOP_SUPPORTER", name: "Top Supporter", description: "Recognised among a campaign's leading supporters.", icon: "⭐", enabled: true, threshold: 1 },
];

function normalize(address: string): string {
  return String(address ?? "").trim().toLowerCase();
}

class BackerBadgeService {
  private definitions = new Map(DEFAULT_DEFINITIONS.map((definition) => [definition.key, { ...definition }]));
  private awarded = new Map<string, Map<BackerBadgeKey, AwardedBackerBadge>>();
  private activity = new Map<string, BackerActivity>();

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

  recordPledge(input: { address: string; campaignId: string; amount: string; campaignCreatedAt?: number; pledgedAt?: number }): AwardedBackerBadge[] {
    const address = normalize(input.address);
    if (!address) throw new Error("Backer address is required");
    const now = input.pledgedAt ?? Date.now();
    const current = this.activity.get(address) ?? { address, pledgeCount: 0, campaignsBacked: 0, totalPledged: "0" };
    const campaignKey = `${address}:${input.campaignId}`;
    const campaignCountKey = `${campaignKey}:counted`;
    const campaignCounted = this.activity.has(campaignCountKey);
    const next: BackerActivity = {
      ...current,
      pledgeCount: current.pledgeCount + 1,
      campaignsBacked: current.campaignsBacked + (campaignCounted ? 0 : 1),
      totalPledged: (BigInt(current.totalPledged) + BigInt(input.amount)).toString(),
      firstPledgeAt: current.firstPledgeAt ?? now,
      earlyBird: current.earlyBird || Boolean(input.campaignCreatedAt && now - input.campaignCreatedAt <= 24 * 60 * 60 * 1000),
    };
    this.activity.set(address, next);
    this.activity.set(campaignCountKey, next);
    return this.evaluate(address, now);
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
    const qualifies: Record<BackerBadgeKey, boolean> = {
      FIRST_PLEDGE: activity.pledgeCount >= 1,
      TEN_CAMPAIGNS: activity.campaignsBacked >= (this.definitions.get("TEN_CAMPAIGNS")?.threshold ?? 10),
      EARLY_BIRD: Boolean(activity.earlyBird),
      TOP_SUPPORTER: Boolean(activity.topSupporter),
    };
    for (const [badgeKey, qualifiesBadge] of Object.entries(qualifies) as [BackerBadgeKey, boolean][]) {
      const definition = this.definitions.get(badgeKey);
      if (definition?.enabled && qualifiesBadge && !earned.has(badgeKey)) earned.set(badgeKey, { ...definition, awardedAt: now });
    }
    this.awarded.set(key, earned);
    return Array.from(earned.values()).map((badge) => ({ ...badge }));
  }

  getProfile(address: string): { activity: BackerActivity; badges: AwardedBackerBadge[] } {
    const key = normalize(address);
    const activity = this.activity.get(key) ?? { address: key, pledgeCount: 0, campaignsBacked: 0, totalPledged: "0" };
    return { activity: { ...activity }, badges: this.evaluate(key) };
  }

  reset(): void {
    this.awarded.clear();
    this.activity.clear();
    this.definitions = new Map(DEFAULT_DEFINITIONS.map((definition) => [definition.key, { ...definition }]));
  }
}

export const backerBadgeService = new BackerBadgeService();
export { BackerBadgeService };
