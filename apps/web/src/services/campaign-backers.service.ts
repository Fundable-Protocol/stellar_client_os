import {
  ANONYMOUS_BACKER_LABEL,
  BackerContribution,
  BackerPrivacyPreference,
  BackerVisibility,
  FeaturedBacker,
  FeatureBackerInput,
  GetTopBackersOptions,
  HIDDEN_ADDRESS_LABEL,
  MAX_FEATURED_BACKERS,
  RecordContributionInput,
  SetPrivacyInput,
  TOP_BACKERS_LIMIT,
  TopBackerEntry,
  TopBackersResult,
  canBeFeatured,
  defaultBackerPrivacy,
  isBackerVisibility,
  parseTokenAmount,
  sumTokenAmounts,
  formatTokenAmount,
} from "@/types/campaign-backers";

/**
 * Top backers per campaign.
 *
 * Ranks every backer of a campaign by the total amount they contributed and
 * exposes a privacy-aware view of the leaderboard:
 *
 *  - PRIVATE backers never appear publicly (they are only counted).
 *  - ANONYMOUS backers keep their rank but are shown without a name, address
 *    or avatar — and optionally without an amount.
 *  - Campaign creators may feature up to {@link MAX_FEATURED_BACKERS} backers,
 *    which pins them to the top of the list. Featuring is only possible for
 *    backers that are PUBLIC and allow featuring, and a backer who changes
 *    their preference is un-featured immediately (privacy wins).
 *
 * Mirrors the in-memory singleton pattern used by campaign-community.service
 * and campaign-collaboration.service until a persistent data source lands.
 */
export type BackerActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface BackerAggregate {
  backerAddress: string;
  totalScaled: bigint;
  totalAmount: string;
  contributionCount: number;
  firstContributedAt: number;
  lastContributedAt: number;
  token: string;
  displayName?: string;
  avatarUrl?: string;
  message?: string;
}

const sameAddress = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

class CampaignBackersService {
  private contributions = new Map<string, BackerContribution[]>();
  private preferences = new Map<string, BackerPrivacyPreference>();
  private featured = new Map<string, FeaturedBacker[]>();
  private creators = new Map<string, string>();

  private prefKey(campaignId: string, backerAddress: string) {
    return `${campaignId}:${backerAddress.trim().toLowerCase()}`;
  }

  // ---------------------------------------------------------------- creators

  /** Register the campaign creator — required before backers can be featured. */
  registerCampaignCreator(campaignId: string, creatorAddress: string): void {
    if (!campaignId?.trim() || !creatorAddress?.trim()) return;
    this.creators.set(campaignId.trim(), creatorAddress.trim());
  }

  getCampaignCreator(campaignId: string): string | undefined {
    return this.creators.get(campaignId?.trim() ?? "");
  }

  // ----------------------------------------------------------- contributions

  getContributions(campaignId: string): BackerContribution[] {
    return [...(this.contributions.get(campaignId?.trim() ?? "") ?? [])];
  }

  hasContributions(campaignId: string): boolean {
    return (this.contributions.get(campaignId?.trim() ?? "") ?? []).length > 0;
  }

  recordContribution(input: RecordContributionInput): BackerContribution {
    const campaignId = input.campaignId?.trim();
    const backerAddress = input.backerAddress?.trim();
    if (!campaignId) throw new Error("campaignId is required");
    if (!backerAddress) throw new Error("backerAddress is required");

    const scaled = parseTokenAmount(input.amount);
    if (scaled === null || scaled <= 0n) throw new Error("A positive contribution amount is required");

    const contribution: BackerContribution = {
      id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      campaignId,
      backerAddress,
      amount: String(input.amount).trim(),
      token: (input.token?.trim() || "XLM").toUpperCase(),
      contributedAt: input.contributedAt ?? Date.now(),
      txHash: input.txHash?.trim() || undefined,
      displayName: input.displayName?.trim() || undefined,
      avatarUrl: input.avatarUrl?.trim() || undefined,
      message: input.message?.trim() || undefined,
    };

    const list = this.contributions.get(campaignId) ?? [];
    list.push(contribution);
    this.contributions.set(campaignId, list);

    // First contribution establishes the default (public) preference; an
    // existing preference is always left untouched.
    const key = this.prefKey(campaignId, backerAddress);
    if (!this.preferences.has(key)) {
      this.preferences.set(key, defaultBackerPrivacy(campaignId, backerAddress, contribution.contributedAt));
    }

    return contribution;
  }

  // ----------------------------------------------------------------- privacy

  getPrivacyPreference(campaignId: string, backerAddress: string): BackerPrivacyPreference {
    return (
      this.preferences.get(this.prefKey(campaignId ?? "", backerAddress ?? "")) ??
      defaultBackerPrivacy(campaignId ?? "", backerAddress ?? "")
    );
  }

  setPrivacyPreference(
    input: SetPrivacyInput,
    now = Date.now(),
  ): { preference: BackerPrivacyPreference; removedFromFeatured: boolean } {
    const campaignId = input.campaignId?.trim();
    const backerAddress = input.backerAddress?.trim();
    if (!campaignId) throw new Error("campaignId is required");
    if (!backerAddress) throw new Error("backerAddress is required");
    if (input.visibility !== undefined && !isBackerVisibility(input.visibility)) {
      throw new Error(`Unknown visibility: ${String(input.visibility)}`);
    }

    const current = this.getPrivacyPreference(campaignId, backerAddress);
    const preference: BackerPrivacyPreference = {
      ...current,
      visibility: (input.visibility ?? current.visibility) as BackerVisibility,
      showAmount: input.showAmount ?? current.showAmount,
      allowFeaturing: input.allowFeaturing ?? current.allowFeaturing,
      updatedAt: now,
    };
    this.preferences.set(this.prefKey(campaignId, backerAddress), preference);

    // Privacy wins: a backer who is no longer publicly featureable must not
    // stay pinned on the leaderboard.
    let removedFromFeatured = false;
    if (!canBeFeatured(preference)) {
      removedFromFeatured = this.removeFeatured(campaignId, backerAddress);
    }

    return { preference, removedFromFeatured };
  }

  // ---------------------------------------------------------------- featuring

  getFeaturedBackers(campaignId: string): FeaturedBacker[] {
    return [...(this.featured.get(campaignId?.trim() ?? "") ?? [])];
  }

  isFeatured(campaignId: string, backerAddress: string): boolean {
    return this.getFeaturedBackers(campaignId).some((entry) => sameAddress(entry.backerAddress, backerAddress));
  }

  private removeFeatured(campaignId: string, backerAddress: string): boolean {
    const list = this.getFeaturedBackers(campaignId);
    const updated = list.filter((entry) => !sameAddress(entry.backerAddress, backerAddress));
    if (updated.length === list.length) return false;
    this.featured.set(campaignId.trim(), updated);
    return true;
  }

  featureBacker(input: FeatureBackerInput, now = Date.now()): BackerActionResult<FeaturedBacker> {
    const campaignId = input.campaignId?.trim();
    const backerAddress = input.backerAddress?.trim();
    const featuredBy = input.featuredBy?.trim();
    if (!campaignId) return { ok: false, error: "campaignId is required" };
    if (!backerAddress) return { ok: false, error: "backerAddress is required" };
    if (!featuredBy) return { ok: false, error: "featuredBy is required" };

    const creator = (input.campaignCreator?.trim() || this.getCampaignCreator(campaignId) || "").trim();
    if (!creator) return { ok: false, error: "Campaign creator is unknown — cannot feature backers" };
    if (!sameAddress(creator, featuredBy)) {
      return { ok: false, error: "Only the campaign creator can feature backers" };
    }

    if (!this.hasBacker(campaignId, backerAddress)) {
      return { ok: false, error: "This address has not contributed to the campaign" };
    }

    const preference = this.getPrivacyPreference(campaignId, backerAddress);
    if (preference.visibility === "PRIVATE") {
      return { ok: false, error: "This backer keeps their support private and cannot be featured" };
    }
    if (!canBeFeatured(preference)) {
      return { ok: false, error: "This backer opted out of being featured" };
    }

    const existing = this.getFeaturedBackers(campaignId).find((entry) =>
      sameAddress(entry.backerAddress, backerAddress),
    );
    if (existing) {
      const updated: FeaturedBacker = {
        ...existing,
        featuredAt: now,
        note: input.note?.trim() ? input.note.trim() : existing.note,
      };
      this.replaceFeatured(campaignId, updated);
      return { ok: true, value: updated };
    }

    const list = this.getFeaturedBackers(campaignId);
    if (list.length >= MAX_FEATURED_BACKERS) {
      return {
        ok: false,
        error: `You can feature up to ${MAX_FEATURED_BACKERS} backers — un-feature one first`,
      };
    }

    const featured: FeaturedBacker = {
      campaignId,
      backerAddress,
      featuredBy,
      featuredAt: now,
      note: input.note?.trim() || undefined,
    };
    list.push(featured);
    this.featured.set(campaignId, list);
    return { ok: true, value: featured };
  }

  unfeatureBacker(
    input: Omit<FeatureBackerInput, "note">,
  ): BackerActionResult<{ removed: boolean }> {
    const campaignId = input.campaignId?.trim();
    const backerAddress = input.backerAddress?.trim();
    const featuredBy = input.featuredBy?.trim();
    if (!campaignId) return { ok: false, error: "campaignId is required" };
    if (!backerAddress) return { ok: false, error: "backerAddress is required" };
    if (!featuredBy) return { ok: false, error: "featuredBy is required" };

    const creator = (input.campaignCreator?.trim() || this.getCampaignCreator(campaignId) || "").trim();
    if (!creator) return { ok: false, error: "Campaign creator is unknown — cannot feature backers" };
    if (!sameAddress(creator, featuredBy)) {
      return { ok: false, error: "Only the campaign creator can feature backers" };
    }

    return { ok: true, value: { removed: this.removeFeatured(campaignId, backerAddress) } };
  }

  /** Creator-facing toggle used by the leaderboard UI. */
  toggleFeatured(input: FeatureBackerInput, now = Date.now()): BackerActionResult<FeaturedBacker | { removed: boolean }> {
    const campaignId = input.campaignId?.trim();
    const backerAddress = input.backerAddress?.trim();
    if (!campaignId || !backerAddress) return { ok: false, error: "campaignId and backerAddress are required" };
    if (this.isFeatured(campaignId, backerAddress)) return this.unfeatureBacker(input);
    return this.featureBacker(input, now);
  }

  private replaceFeatured(campaignId: string, entry: FeaturedBacker): void {
    const list = this.getFeaturedBackers(campaignId).map((item) =>
      sameAddress(item.backerAddress, entry.backerAddress) ? entry : item,
    );
    this.featured.set(campaignId.trim(), list);
  }

  private hasBacker(campaignId: string, backerAddress: string): boolean {
    return this.getContributions(campaignId).some((entry) => sameAddress(entry.backerAddress, backerAddress));
  }

  // --------------------------------------------------------------- leaderboard

  /** Aggregate contributions per backer, ordered by total amount (desc). */
  aggregateBackers(campaignId: string): BackerAggregate[] {
    const byAddress = new Map<string, BackerAggregate>();

    for (const contribution of this.getContributions(campaignId)) {
      const key = contribution.backerAddress.trim().toLowerCase();
      const scaled = parseTokenAmount(contribution.amount);
      if (scaled === null || scaled <= 0n) continue;

      const existing = byAddress.get(key);
      if (existing) {
        existing.totalScaled += scaled;
        existing.totalAmount = formatTokenAmount(existing.totalScaled);
        existing.contributionCount += 1;
        existing.firstContributedAt = Math.min(existing.firstContributedAt, contribution.contributedAt);
        existing.lastContributedAt = Math.max(existing.lastContributedAt, contribution.contributedAt);
        existing.displayName = contribution.displayName ?? existing.displayName;
        existing.avatarUrl = contribution.avatarUrl ?? existing.avatarUrl;
        existing.message = contribution.message ?? existing.message;
      } else {
        byAddress.set(key, {
          backerAddress: contribution.backerAddress,
          totalScaled: scaled,
          totalAmount: formatTokenAmount(scaled),
          contributionCount: 1,
          firstContributedAt: contribution.contributedAt,
          lastContributedAt: contribution.contributedAt,
          token: contribution.token,
          displayName: contribution.displayName,
          avatarUrl: contribution.avatarUrl,
          message: contribution.message,
        });
      }
    }

    return Array.from(byAddress.values())
      .sort(
        (a, b) =>
          (a.totalScaled < b.totalScaled ? 1 : a.totalScaled > b.totalScaled ? -1 : 0) ||
          a.firstContributedAt - b.firstContributedAt ||
          a.backerAddress.localeCompare(b.backerAddress),
      );
  }

  /**
   * Privacy-aware top backers list.
   *
   * Ranks are assigned by amount across the rows the viewer is allowed to see,
   * so private backers never leak a gap in the ranking. Featured backers are
   * pinned to the top while keeping the rank they earned by amount.
   */
  getTopBackers(campaignId: string, options: GetTopBackersOptions = {}, now = Date.now()): TopBackersResult {
    const id = campaignId?.trim() ?? "";
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? TOP_BACKERS_LIMIT), 1), 100);
    const viewerAddress = options.viewerAddress?.trim();
    const creatorAddress = options.creatorAddress?.trim() || this.getCampaignCreator(id);
    const viewerIsCreator = sameAddress(viewerAddress, creatorAddress);
    const includePrivate = options.includePrivate ?? viewerIsCreator;

    const featuredList = this.getFeaturedBackers(id);
    const aggregates = this.aggregateBackers(id);

    const totalAmount = sumTokenAmounts(this.getContributions(id).map((entry) => entry.amount));

    let privateBackers = 0;
    const entries: TopBackerEntry[] = [];
    let rank = 0;

    for (const aggregate of aggregates) {
      const preference = this.getPrivacyPreference(id, aggregate.backerAddress);
      const isSelf = sameAddress(viewerAddress, aggregate.backerAddress);
      const unredacted = viewerIsCreator || isSelf || preference.visibility === "PUBLIC";

      if (preference.visibility === "PRIVATE" && !includePrivate && !isSelf) {
        privateBackers += 1;
        continue;
      }

      rank += 1;
      const anonymous = preference.visibility !== "PUBLIC" && !unredacted;
      const amountVisible = unredacted || preference.showAmount !== false;
      const featured = featuredList.find((entry) => sameAddress(entry.backerAddress, aggregate.backerAddress));

      entries.push({
        rank,
        backerAddress: anonymous ? HIDDEN_ADDRESS_LABEL : aggregate.backerAddress,
        displayName: anonymous
          ? ANONYMOUS_BACKER_LABEL
          : aggregate.displayName || aggregate.backerAddress,
        avatarUrl: anonymous ? undefined : aggregate.avatarUrl,
        totalAmount: amountVisible ? aggregate.totalAmount : null,
        amountVisible,
        token: aggregate.token,
        contributionCount: aggregate.contributionCount,
        firstContributedAt: aggregate.firstContributedAt,
        lastContributedAt: aggregate.lastContributedAt,
        // The stored preference, so the UI can badge opted-out backers even
        // when the creator is allowed to resolve their identity.
        visibility: preference.visibility,
        isFeatured: Boolean(featured),
        featuredAt: featured?.featuredAt,
        featureNote: featured?.note,
        isSelf,
        message: anonymous ? undefined : aggregate.message,
      });
    }

    // Featured rows first, then amount order (which is already how we ranked).
    const ordered = [...entries].sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.rank - b.rank);

    return {
      campaignId: id,
      backers: ordered.slice(0, limit),
      limit,
      totalBackers: aggregates.length,
      privateBackers,
      totalAmount,
      featuredCount: featuredList.length,
      updatedAt: now,
    };
  }

  /** Test helper — wipes every in-memory collection. */
  reset(): void {
    this.contributions.clear();
    this.preferences.clear();
    this.featured.clear();
    this.creators.clear();
  }
}

export const backersService = new CampaignBackersService();

/** Demo backer set for the mock campaign used by the campaign detail page. */
export const DEMO_CAMPAIGN_ID = "camp-101";
export const DEMO_CREATOR_ADDRESS = "GD6W...X892";

export const DEMO_BACKER_CONTRIBUTIONS: RecordContributionInput[] = [
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GB44...R771", amount: "15000", token: "XLM", displayName: "Satoshi Forestry Fund", contributedAt: 1_767_225_600_000, message: "Standing behind this reserve for the long run." },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GD99...Z100", amount: "12500", token: "XLM", displayName: "GreenFuture Capital", contributedAt: 1_767_312_000_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GA7B...M221", amount: "5000", token: "USDC", displayName: "EcoDAO Ventures", contributedAt: 1_767_398_400_000, message: "Matching our community's donations 1:1." },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GC11...P443", amount: "2400", token: "XLM", displayName: "Terra Restora", contributedAt: 1_767_484_800_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GB88...K992", amount: "1000", token: "XLM", displayName: "Elena Rostova", contributedAt: 1_767_571_200_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GA31...Q815", amount: "850.5", token: "XLM", displayName: "Ken Adeyemi", contributedAt: 1_767_657_600_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GC72...T260", amount: "600", token: "USDC", displayName: "Marcus Vance", contributedAt: 1_767_744_000_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GB19...F534", amount: "400", token: "XLM", displayName: "Lumen Roots", contributedAt: 1_767_830_400_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GD05...N918", amount: "250", token: "XLM", contributedAt: 1_767_916_800_000, message: "Small contributions add up!" },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GA58...W307", amount: "250", token: "XLM", displayName: "Amara Osei", contributedAt: 1_768_003_200_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GC33...H442", amount: "180", token: "USDC", displayName: "Nils Berg", contributedAt: 1_768_089_600_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GB76...L689", amount: "120", token: "XLM", displayName: "Priya Nair", contributedAt: 1_768_176_000_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GA90...D153", amount: "90", token: "XLM", contributedAt: 1_768_262_400_000 },
  { campaignId: DEMO_CAMPAIGN_ID, backerAddress: "GD47...S826", amount: "60", token: "USDC", contributedAt: 1_768_348_800_000 },
];

/**
 * Seed the demo campaign once so the leaderboard is not empty on the mock
 * campaign detail page. Safe to call repeatedly; returns true when it seeded.
 */
export function seedDemoBackers(campaignId: string = DEMO_CAMPAIGN_ID): boolean {
  if (campaignId !== DEMO_CAMPAIGN_ID || backersService.hasContributions(campaignId)) return false;

  backersService.registerCampaignCreator(campaignId, DEMO_CREATOR_ADDRESS);
  for (const contribution of DEMO_BACKER_CONTRIBUTIONS) {
    backersService.recordContribution(contribution);
  }

  // Two backers exercise the privacy paths: one anonymous (rank kept, identity
  // hidden, amount shown) and one fully private (excluded from the board).
  backersService.setPrivacyPreference({
    campaignId,
    backerAddress: "GA31...Q815",
    visibility: "ANONYMOUS",
    showAmount: true,
  });
  backersService.setPrivacyPreference({
    campaignId,
    backerAddress: "GD47...S826",
    visibility: "PRIVATE",
  });

  return true;
}
