import { beforeEach, describe, expect, it } from "vitest";
import { backersService, seedDemoBackers, DEMO_CAMPAIGN_ID, DEMO_CREATOR_ADDRESS } from "./campaign-backers.service";
import {
  ANONYMOUS_BACKER_LABEL,
  HIDDEN_ADDRESS_LABEL,
  MAX_FEATURED_BACKERS,
  TOP_BACKERS_LIMIT,
  backerInitials,
  canBeFeatured,
  formatBackerAmount,
  formatTokenAmount,
  parseTokenAmount,
  sumTokenAmounts,
} from "@/types/campaign-backers";

const CAMPAIGN = "camp-test";
const CREATOR = "GCREATOR...AAAA";
const ALICE = "GALICE...AAAA";
const BOB = "GBOB...BBBB";
const CAROL = "GCAROL...CCCC";
const DAVE = "GDAVE...DDDD";

function seedBasic() {
  backersService.registerCampaignCreator(CAMPAIGN, CREATOR);
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: ALICE, amount: "100", token: "XLM", contributedAt: 1_000, displayName: "Alice Adams" });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: BOB, amount: "500", token: "XLM", contributedAt: 2_000, displayName: "Bob Bale" });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: CAROL, amount: "250.5", token: "USDC", contributedAt: 3_000, displayName: "Carol Cruz" });
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: DAVE, amount: "250.5", token: "USDC", contributedAt: 4_000, displayName: "Dave Diaz" });
}

describe("campaign-backers.service — contributions", () => {
  beforeEach(() => backersService.reset());

  it("rejects contributions without an address or a positive amount", () => {
    expect(() => backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: "", amount: "10" }))
      .toThrow(/backerAddress is required/);
    expect(() => backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: ALICE, amount: "0" }))
      .toThrow(/positive contribution amount/);
    expect(() => backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: ALICE, amount: "abc" }))
      .toThrow(/positive contribution amount/);
    expect(() => backersService.recordContribution({ campaignId: "", backerAddress: ALICE, amount: "10" }))
      .toThrow(/campaignId is required/);
  });

  it("defaults new backers to a public, featureable preference", () => {
    backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: ALICE, amount: "10" });
    const preference = backersService.getPrivacyPreference(CAMPAIGN, ALICE);
    expect(preference.visibility).toBe("PUBLIC");
    expect(preference.showAmount).toBe(true);
    expect(preference.allowFeaturing).toBe(true);
    expect(canBeFeatured(preference)).toBe(true);
  });
});

describe("campaign-backers.service — ranking", () => {
  beforeEach(() => {
    backersService.reset();
    seedBasic();
  });

  it("ranks backers by total contributed amount", () => {
    const { backers } = backersService.getTopBackers(CAMPAIGN);
    expect(backers.map((entry) => entry.displayName)).toEqual([
      "Bob Bale",
      "Carol Cruz",
      "Dave Diaz",
      "Alice Adams",
    ]);
    expect(backers.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
  });

  it("breaks amount ties by earliest contribution, then address", () => {
    const { backers } = backersService.getTopBackers(CAMPAIGN);
    // Carol and Dave both gave 250.5 — Carol contributed first.
    expect(backers[1].displayName).toBe("Carol Cruz");
    expect(backers[2].displayName).toBe("Dave Diaz");
  });

  it("sums multiple contributions from the same backer", () => {
    backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: ALICE, amount: "900", token: "XLM", contributedAt: 5_000 });
    const { backers } = backersService.getTopBackers(CAMPAIGN);
    const alice = backers.find((entry) => entry.displayName === "Alice Adams");
    expect(alice?.rank).toBe(1);
    expect(alice?.totalAmount).toBe("1000");
    expect(alice?.contributionCount).toBe(2);
  });

  it("defaults to the top 10 and accepts a custom limit", () => {
    for (let i = 0; i < 15; i += 1) {
      backersService.recordContribution({
        campaignId: CAMPAIGN,
        backerAddress: `GEXTRA${i}...ZZZZ`,
        amount: String(1000 + i),
        contributedAt: 10_000 + i,
      });
    }
    const top = backersService.getTopBackers(CAMPAIGN);
    expect(top.limit).toBe(TOP_BACKERS_LIMIT);
    expect(top.backers).toHaveLength(TOP_BACKERS_LIMIT);
    expect(top.totalBackers).toBe(19);
    // Biggest contributor is first even though it was recorded last.
    expect(top.backers[0].totalAmount).toBe("1014");

    expect(backersService.getTopBackers(CAMPAIGN, { limit: 3 }).backers).toHaveLength(3);
  });

  it("reports the aggregate amount and backer count", () => {
    const result = backersService.getTopBackers(CAMPAIGN);
    expect(result.totalBackers).toBe(4);
    expect(result.totalAmount).toBe("1101");
  });
});

describe("campaign-backers.service — privacy preferences", () => {
  beforeEach(() => {
    backersService.reset();
    seedBasic();
  });

  it("keeps an anonymous backer ranked but redacts their identity", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "ANONYMOUS" });
    const { backers } = backersService.getTopBackers(CAMPAIGN);

    expect(backers[0].rank).toBe(1);
    expect(backers[0].displayName).toBe(ANONYMOUS_BACKER_LABEL);
    expect(backers[0].backerAddress).toBe(HIDDEN_ADDRESS_LABEL);
    expect(backers[0].avatarUrl).toBeUndefined();
    expect(backers[0].message).toBeUndefined();
    // Amount still shown by default when only the identity is hidden.
    expect(backers[0].totalAmount).toBe("500");
    expect(backers[0].amountVisible).toBe(true);
  });

  it("hides the amount for anonymous backers who opt out of showing it", () => {
    backersService.setPrivacyPreference({
      campaignId: CAMPAIGN,
      backerAddress: BOB,
      visibility: "ANONYMOUS",
      showAmount: false,
    });
    const { backers } = backersService.getTopBackers(CAMPAIGN);
    expect(backers[0].totalAmount).toBeNull();
    expect(backers[0].amountVisible).toBe(false);
  });

  it("excludes private backers from the public board but still counts them", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "PRIVATE" });
    const result = backersService.getTopBackers(CAMPAIGN);

    expect(result.backers.map((entry) => entry.displayName)).not.toContain("Bob Bale");
    expect(result.privateBackers).toBe(1);
    expect(result.totalBackers).toBe(4);
    // Private backers do not leave a gap: the next backer becomes rank 1.
    expect(result.backers[0]).toMatchObject({ rank: 1, displayName: "Carol Cruz" });
    // The aggregate still includes their contribution.
    expect(result.totalAmount).toBe("1101");
  });

  it("shows the creator the unredacted board, including private backers", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "PRIVATE" });
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: CAROL, visibility: "ANONYMOUS", showAmount: false });

    const creatorView = backersService.getTopBackers(CAMPAIGN, { viewerAddress: CREATOR, creatorAddress: CREATOR });
    expect(creatorView.privateBackers).toBe(0);
    expect(creatorView.backers.map((entry) => entry.displayName)).toContain("Bob Bale");
    const carol = creatorView.backers.find((entry) => entry.displayName === "Carol Cruz");
    expect(carol?.totalAmount).toBe("250.5");

    const publicView = backersService.getTopBackers(CAMPAIGN);
    expect(publicView.privateBackers).toBe(1);
    expect(publicView.backers[0].displayName).toBe(ANONYMOUS_BACKER_LABEL);
    expect(publicView.backers[0].totalAmount).toBeNull();
  });

  it("lets a backer see their own row even when they are private", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "PRIVATE" });
    const selfView = backersService.getTopBackers(CAMPAIGN, { viewerAddress: BOB });
    const bob = selfView.backers.find((entry) => entry.isSelf);
    expect(bob?.displayName).toBe("Bob Bale");
    expect(bob?.backerAddress).toBe(BOB);
    expect(bob?.visibility).toBe("PRIVATE");
  });

  it("rejects an unknown visibility value", () => {
    expect(() =>
      backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "SEMI" as never }),
    ).toThrow(/Unknown visibility/);
  });
});

describe("campaign-backers.service — creator featuring", () => {
  beforeEach(() => {
    backersService.reset();
    seedBasic();
  });

  it("lets the campaign creator feature a backer and pins them to the top", () => {
    const result = backersService.featureBacker({
      campaignId: CAMPAIGN,
      backerAddress: ALICE,
      featuredBy: CREATOR,
      note: "First believer in the reserve.",
    });
    expect(result.ok).toBe(true);

    const { backers, featuredCount } = backersService.getTopBackers(CAMPAIGN);
    expect(featuredCount).toBe(1);
    expect(backers[0].displayName).toBe("Alice Adams");
    expect(backers[0].isFeatured).toBe(true);
    expect(backers[0].featureNote).toBe("First believer in the reserve.");
    // Alice is the smallest backer — she keeps the rank she earned by amount.
    expect(backers[0].rank).toBe(4);
  });

  it("refuses to let anyone but the creator feature backers", () => {
    const result = backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: ALICE, featuredBy: BOB });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Only the campaign creator/);
    expect(backersService.getFeaturedBackers(CAMPAIGN)).toHaveLength(0);
  });

  it("refuses to feature an address that never contributed", () => {
    const result = backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: "GNOBODY...ZZZZ", featuredBy: CREATOR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/has not contributed/);
  });

  it("refuses to feature anonymous or private backers", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, visibility: "ANONYMOUS" });
    const anonymous = backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(anonymous.ok).toBe(false);
    if (!anonymous.ok) expect(anonymous.error).toMatch(/opted out/);

    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: CAROL, visibility: "PRIVATE" });
    const privateBacker = backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: CAROL, featuredBy: CREATOR });
    expect(privateBacker.ok).toBe(false);
    if (!privateBacker.ok) expect(privateBacker.error).toMatch(/private/);
  });

  it("refuses to feature a backer who disabled featuring while staying public", () => {
    backersService.setPrivacyPreference({ campaignId: CAMPAIGN, backerAddress: BOB, allowFeaturing: false });
    const result = backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/opted out/);
  });

  it(`caps featuring at ${MAX_FEATURED_BACKERS} backers`, () => {
    expect(backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR }).ok).toBe(true);
    expect(backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: CAROL, featuredBy: CREATOR }).ok).toBe(true);
    expect(backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: DAVE, featuredBy: CREATOR }).ok).toBe(true);

    const overflow = backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: ALICE, featuredBy: CREATOR });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.error).toMatch(/up to 3/);
    expect(backersService.getFeaturedBackers(CAMPAIGN)).toHaveLength(MAX_FEATURED_BACKERS);
  });

  it("is idempotent when re-featuring the same backer", () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR, note: "First" });
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR, note: "Updated" });
    const featured = backersService.getFeaturedBackers(CAMPAIGN);
    expect(featured).toHaveLength(1);
    expect(featured[0].note).toBe("Updated");
  });

  it("removes a feature when the creator un-features or toggles", () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(true);

    const removed = backersService.unfeatureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(removed.ok && removed.value.removed).toBe(true);
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(false);

    // toggleFeatured flips both ways.
    backersService.toggleFeatured({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(true);
    backersService.toggleFeatured({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(false);
  });

  it("drops the feature automatically when the backer tightens their privacy", () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(true);

    const { removedFromFeatured } = backersService.setPrivacyPreference({
      campaignId: CAMPAIGN,
      backerAddress: BOB,
      visibility: "ANONYMOUS",
    });

    expect(removedFromFeatured).toBe(true);
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(false);
    expect(backersService.getFeaturedBackers(CAMPAIGN)).toHaveLength(0);
  });

  it("keeps the feature when the backer stays public", () => {
    backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    const { removedFromFeatured } = backersService.setPrivacyPreference({
      campaignId: CAMPAIGN,
      backerAddress: BOB,
      showAmount: false,
    });
    expect(removedFromFeatured).toBe(false);
    expect(backersService.isFeatured(CAMPAIGN, BOB)).toBe(true);
  });

  it("requires a known campaign creator before featuring is possible", () => {
    backersService.reset();
    backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: BOB, amount: "10" });
    const result = backersService.featureBacker({ campaignId: CAMPAIGN, backerAddress: BOB, featuredBy: CREATOR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/creator is unknown/);
  });
});

describe("campaign-backers.service — demo seed data", () => {
  beforeEach(() => backersService.reset());

  it("seeds the mock campaign once with privacy variety", () => {
    expect(seedDemoBackers()).toBe(true);
    expect(seedDemoBackers()).toBe(false);

    const result = backersService.getTopBackers(DEMO_CAMPAIGN_ID);
    expect(result.backers).toHaveLength(TOP_BACKERS_LIMIT);
    expect(result.privateBackers).toBe(1);
    expect(result.backers.some((entry) => entry.displayName === ANONYMOUS_BACKER_LABEL)).toBe(true);
    expect(backersService.getCampaignCreator(DEMO_CAMPAIGN_ID)).toBe(DEMO_CREATOR_ADDRESS);
  });

  it("does not touch other campaigns", () => {
    expect(seedDemoBackers("camp-other")).toBe(false);
    expect(backersService.hasContributions("camp-other")).toBe(false);
  });
});

describe("campaign-backers types — amount helpers", () => {
  it("parses and formats decimal amounts without float drift", () => {
    expect(parseTokenAmount("0.1")).toBe(1_000_000n);
    expect(parseTokenAmount("250.5")).toBe(2_505_000_000n);
    expect(formatTokenAmount(2_505_000_000n)).toBe("250.5");
    expect(formatTokenAmount(1_000_000_000n)).toBe("100");
    expect(parseTokenAmount("abc")).toBeNull();
    expect(parseTokenAmount("")).toBeNull();
    expect(parseTokenAmount(undefined)).toBeNull();
  });

  it("sums amounts exactly and ignores malformed entries", () => {
    expect(sumTokenAmounts(["0.1", "0.2"])).toBe("0.3");
    expect(sumTokenAmounts(["100", "abc", null, "-5", "50.25"])).toBe("150.25");
  });

  it("groups amounts for display", () => {
    expect(formatBackerAmount("1234567")).toBe("1,234,567");
    expect(formatBackerAmount("1234.5")).toBe("1,234.5");
    expect(formatBackerAmount(null)).toBe("Amount hidden");
  });

  it("derives avatar initials", () => {
    expect(backerInitials("Alice Adams", "GALICE")).toBe("AA");
    expect(backerInitials("Madonna", "GALICE")).toBe("M");
    expect(backerInitials("", "GB88...K992")).toBe("GB");
  });
});
