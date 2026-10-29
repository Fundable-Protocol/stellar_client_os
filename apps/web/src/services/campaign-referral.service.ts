import { randomBytes } from "node:crypto";
import { getCampaign, type CampaignRecord } from "./campaign.service";

export interface CampaignReferralLink {
  code: string;
  campaignId: string;
  backerAddress: string;
  createdAt: number;
}

export interface ReferralStats {
  clicks: number;
  conversions: number;
  amountRaisedByToken: Record<string, string>;
}

export interface ReferralLeaderboardEntry extends ReferralStats {
  backerAddress: string;
}

interface ReferralConversion {
  pledgeId: string;
  donorAddress: string;
  amount: string;
  token: string;
  createdAt: number;
}

interface ReferralMetrics {
  clicks: number;
  conversions: ReferralConversion[];
}

const sameAddress = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/** Add decimal amounts without converting token values through floating point. */
function addAmounts(left: string, right: string): string {
  const valid = (value: string) => /^\d+(?:\.\d+)?$/.test(value);
  if (!valid(left) || !valid(right)) throw new Error("Referral amount must be a non-negative decimal string");
  const precision = Math.max(left.split(".")[1]?.length ?? 0, right.split(".")[1]?.length ?? 0);
  const scale = 10n ** BigInt(precision);
  const toScaled = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * scale + BigInt((fraction + "0".repeat(precision)).slice(0, precision) || "0");
  };
  const total = toScaled(left) + toScaled(right);
  if (precision === 0) return total.toString();
  const whole = total / scale;
  const fraction = (total % scale).toString().padStart(precision, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Campaign-specific backer referrals. In keeping with the existing demo data
 * layer, records are held in memory; production deployments should persist
 * links and events in a database with unique (campaign, backer) and code keys.
 */
class CampaignReferralService {
  private readonly linksByKey = new Map<string, CampaignReferralLink>();
  private readonly linksByCode = new Map<string, CampaignReferralLink>();
  private readonly metricsByCode = new Map<string, ReferralMetrics>();

  private linkKey(campaignId: string, backerAddress: string): string {
    return `${campaignId.trim()}::${backerAddress.trim().toLowerCase()}`;
  }

  /** Return the same cryptographically random short code for this pair each time. */
  createOrGetLink(campaignId: string, backerAddress: string, now = Date.now()): CampaignReferralLink {
    const campaign = campaignId.trim();
    const backer = backerAddress.trim();
    if (!campaign) throw new Error("campaignId is required");
    if (!backer) throw new Error("backerAddress is required");

    const key = this.linkKey(campaign, backer);
    const existing = this.linksByKey.get(key);
    if (existing) return { ...existing };

    let code = "";
    do {
      // Six random bytes encode to an eight-character URL-safe code.
      code = randomBytes(6).toString("base64url");
    } while (this.linksByCode.has(code));

    const link: CampaignReferralLink = { code, campaignId: campaign, backerAddress: backer, createdAt: now };
    this.linksByKey.set(key, link);
    this.linksByCode.set(code, link);
    this.metricsByCode.set(code, { clicks: 0, conversions: [] });
    return { ...link };
  }

  getLinkByCode(code: string): CampaignReferralLink | null {
    const link = this.linksByCode.get(code);
    return link ? { ...link } : null;
  }

  async resolveLink(code: string): Promise<{ link: CampaignReferralLink; campaign: CampaignRecord } | null> {
    const link = this.linksByCode.get(code);
    if (!link) return null;
    const campaign = await getCampaign(link.campaignId);
    return campaign ? { link: { ...link }, campaign } : null;
  }

  recordClick(code: string): boolean {
    const metrics = this.metricsByCode.get(code);
    if (!metrics) return false;
    metrics.clicks += 1;
    return true;
  }

  /** Count a confirmed pledge once, only for a valid campaign link and a different wallet. */
  recordConversion(input: {
    code?: string;
    campaignId: string;
    pledgeId: string;
    donorAddress: string;
    amount: string;
    token: string;
    createdAt?: number;
  }): boolean {
    if (!input.code?.trim() || !input.pledgeId?.trim() || !input.donorAddress?.trim()) return false;
    const link = this.linksByCode.get(input.code.trim());
    const metrics = this.metricsByCode.get(input.code.trim());
    if (!link || !metrics || link.campaignId !== input.campaignId || sameAddress(link.backerAddress, input.donorAddress)) return false;
    if (!/^\d+(?:\.\d+)?$/.test(input.amount) || Number(input.amount) <= 0 || !input.token.trim()) return false;
    if (metrics.conversions.some((conversion) => conversion.pledgeId === input.pledgeId.trim())) return false;

    metrics.conversions.push({
      pledgeId: input.pledgeId.trim(),
      donorAddress: input.donorAddress.trim(),
      amount: input.amount,
      token: input.token.trim().toUpperCase(),
      createdAt: input.createdAt ?? Date.now(),
    });
    return true;
  }

  getStats(code: string, backerAddress?: string): ReferralStats | null {
    const link = this.linksByCode.get(code);
    const metrics = this.metricsByCode.get(code);
    if (!link || !metrics || (backerAddress && !sameAddress(link.backerAddress, backerAddress))) return null;
    const amountRaisedByToken: Record<string, string> = {};
    for (const conversion of metrics.conversions) {
      amountRaisedByToken[conversion.token] = addAmounts(amountRaisedByToken[conversion.token] ?? "0", conversion.amount);
    }
    return { clicks: metrics.clicks, conversions: metrics.conversions.length, amountRaisedByToken };
  }

  getCampaignLeaderboard(campaignId: string): ReferralLeaderboardEntry[] {
    const totals = new Map<string, ReferralLeaderboardEntry>();
    for (const link of this.linksByCode.values()) {
      if (link.campaignId !== campaignId) continue;
      const stats = this.getStats(link.code);
      if (!stats) continue;
      const key = link.backerAddress.toLowerCase();
      const entry = totals.get(key) ?? {
        backerAddress: link.backerAddress,
        clicks: 0,
        conversions: 0,
        amountRaisedByToken: {},
      };
      entry.clicks += stats.clicks;
      entry.conversions += stats.conversions;
      for (const [token, amount] of Object.entries(stats.amountRaisedByToken)) {
        entry.amountRaisedByToken[token] = addAmounts(entry.amountRaisedByToken[token] ?? "0", amount);
      }
      totals.set(key, entry);
    }
    return [...totals.values()].sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks);
  }

  reset(): void {
    this.linksByKey.clear();
    this.linksByCode.clear();
    this.metricsByCode.clear();
  }
}

export const campaignReferralService = new CampaignReferralService();
