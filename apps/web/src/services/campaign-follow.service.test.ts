import { beforeEach, describe, expect, it } from "vitest";
import { followService } from "./campaign-follow.service";
import {
  DEFAULT_FOLLOW_EVENTS,
  DEFAULT_FOLLOW_PREFS,
  FOLLOW_CHANNELS,
  FOLLOW_EVENTS,
  FOLLOW_FREQUENCIES,
  validateFollowDestination,
} from "@/types/campaign-follow";

const CAMPAIGN = "camp-test";
const ALICE = "GALICE...AAAA";
const BOB = "GBOB...BBBB";
const carolMixed = "gcarol...cccc";

beforeEach(() => followService.reset());

describe("campaign-follow.service — following", () => {
  it("rejects follows without a campaign or follower address", () => {
    expect(() => followService.follow({ campaignId: "", followerAddress: ALICE }))
      .toThrow(/campaignId is required/);
    expect(() => followService.follow({ campaignId: CAMPAIGN, followerAddress: "  " }))
      .toThrow(/followerAddress is required/);
  });

  it("creates a follow with default in-app preferences", () => {
    const follow = followService.follow({ campaignId: CAMPAIGN, followerAddress: ALICE });
    expect(follow.campaignId).toBe(CAMPAIGN);
    expect(follow.followerAddress).toBe(ALICE);
    expect(follow.prefs.channel).toBe("IN_APP");
    expect(follow.prefs.frequency).toBe("INSTANT");
    expect(follow.prefs.events).toEqual(DEFAULT_FOLLOW_EVENTS);
    expect(follow.createdAt).toBeGreaterThan(0);
  });

  it("is idempotent per wallet — re-following updates prefs instead of duplicating", () => {
    followService.follow({ campaignId: CAMPAIGN, followerAddress: ALICE });
    followService.follow({
      campaignId: CAMPAIGN,
      followerAddress: ALICE,
      prefs: { channel: "EMAIL", destination: "alice@example.com" },
    });
    expect(followService.getFollowerCount(CAMPAIGN)).toBe(1);
    const follow = followService.getFollow(CAMPAIGN, ALICE);
    expect(follow?.prefs.channel).toBe("EMAIL");
    expect(follow?.prefs.destination).toBe("alice@example.com");
  });

  it("matches followers case-insensitively", () => {
    followService.follow({ campaignId: CAMPAIGN, followerAddress: carolMixed });
    expect(followService.isFollowing(CAMPAIGN, "GCAROL...CCCC")).toBe(true);
    expect(followService.getFollow(CAMPAIGN, "GCAROL...CCCC")).not.toBeNull();
    expect(followService.getFollowerCount(CAMPAIGN)).toBe(1);
  });

  it("tracks followers per campaign independently", () => {
    followService.follow({ campaignId: "camp-a", followerAddress: ALICE });
    followService.follow({ campaignId: "camp-b", followerAddress: ALICE });
    followService.follow({ campaignId: "camp-a", followerAddress: BOB });
    expect(followService.getFollowerCount("camp-a")).toBe(2);
    expect(followService.getFollowerCount("camp-b")).toBe(1);
    expect(followService.getFollowsFor(ALICE).length).toBe(2);
  });

  it("unfollows and reports whether anything was removed", () => {
    followService.follow({ campaignId: CAMPAIGN, followerAddress: ALICE });
    expect(followService.unfollow(CAMPAIGN, ALICE)).toBe(true);
    expect(followService.isFollowing(CAMPAIGN, ALICE)).toBe(false);
    expect(followService.unfollow(CAMPAIGN, ALICE)).toBe(false);
  });
});

describe("campaign-follow.service — preferences", () => {
  it("requires a valid destination for EMAIL and WEBHOOK channels", () => {
    expect(() =>
      followService.follow({
        campaignId: CAMPAIGN,
        followerAddress: ALICE,
        prefs: { channel: "EMAIL" },
      })
    ).toThrow(/Invalid destination for Email/);
    expect(() =>
      followService.follow({
        campaignId: CAMPAIGN,
        followerAddress: ALICE,
        prefs: { channel: "WEBHOOK", destination: "ftp://nope" },
      })
    ).toThrow(/Invalid destination for Webhook/);
  });

  it("rejects unknown channels, frequencies, and events", () => {
    expect(() =>
      followService.follow({
        campaignId: CAMPAIGN,
        followerAddress: ALICE,
        prefs: { channel: "PIGEON" as never },
      })
    ).toThrow(/Unknown follow channel/);
    expect(() =>
      followService.follow({
        campaignId: CAMPAIGN,
        followerAddress: ALICE,
        prefs: { frequency: "HOURLY" as never },
      })
    ).toThrow(/Unknown follow frequency/);
    expect(() =>
      followService.follow({
        campaignId: CAMPAIGN,
        followerAddress: ALICE,
        prefs: { events: ["NOPE"] as never },
      })
    ).toThrow(/Unknown follow event/);
  });

  it("rejects an empty event selection", () => {
    expect(() =>
      followService.follow({
        campaignId: CAMPAIGN,
        followerAddress: ALICE,
        prefs: { events: [] },
      })
    ).toThrow(/At least one follow event/);
  });

  it("updates prefs for an existing follow and returns null when absent", () => {
    followService.follow({ campaignId: CAMPAIGN, followerAddress: ALICE });
    const updated = followService.updatePrefs(CAMPAIGN, ALICE, {
      frequency: "WEEKLY_DIGEST",
    });
    expect(updated?.prefs.frequency).toBe("WEEKLY_DIGEST");
    expect(updated?.prefs.channel).toBe("IN_APP");
    expect(followService.updatePrefs(CAMPAIGN, BOB, { frequency: "WEEKLY_DIGEST" })).toBeNull();
  });
});

describe("campaign-follow.service — update preview", () => {
  it("returns demo progress updates newest-first", () => {
    const updates = followService.getUpdatePreview(CAMPAIGN, 3);
    expect(updates.length).toBe(3);
    expect(updates[0].occurredAt).toBeGreaterThan(updates[1].occurredAt);
    for (const update of updates) {
      expect(FOLLOW_EVENTS[update.event]).toBeDefined();
      expect(update.message.length).toBeGreaterThan(0);
    }
  });

  it("returns an empty list for a blank campaign id", () => {
    expect(followService.getUpdatePreview("")).toEqual([]);
    expect(followService.getUpdatePreview("   ")).toEqual([]);
  });
});

describe("campaign-follow types and validation", () => {
  it("exposes metadata for every channel, frequency, and event", () => {
    for (const channel of Object.keys(FOLLOW_CHANNELS) as (keyof typeof FOLLOW_CHANNELS)[]) {
      expect(FOLLOW_CHANNELS[channel].label.length).toBeGreaterThan(0);
    }
    for (const freq of Object.keys(FOLLOW_FREQUENCIES) as (keyof typeof FOLLOW_FREQUENCIES)[]) {
      expect(FOLLOW_FREQUENCIES[freq].length).toBeGreaterThan(0);
    }
    expect(Object.keys(FOLLOW_EVENTS).length).toBe(DEFAULT_FOLLOW_EVENTS.length);
  });

  it("defaults to in-app instant notifications with all events", () => {
    expect(DEFAULT_FOLLOW_PREFS.channel).toBe("IN_APP");
    expect(DEFAULT_FOLLOW_PREFS.frequency).toBe("INSTANT");
    expect(DEFAULT_FOLLOW_PREFS.events).toContain("MILESTONE_REACHED");
  });

  it("validates destinations per channel", () => {
    expect(validateFollowDestination("EMAIL", "alice@example.com")).toBe(true);
    expect(validateFollowDestination("EMAIL", "alice@sub.example.co.uk")).toBe(true);
    expect(validateFollowDestination("EMAIL", "not-an-email")).toBe(false);
    expect(validateFollowDestination("EMAIL", "a@b")).toBe(false);
    expect(validateFollowDestination("EMAIL", "")).toBe(false);

    expect(validateFollowDestination("WEBHOOK", "https://example.com/hooks/fundable")).toBe(true);
    expect(validateFollowDestination("WEBHOOK", "https://api.example.io:8443/v1/notify?x=1")).toBe(true);
    expect(validateFollowDestination("WEBHOOK", "http://insecure.example.com/hook")).toBe(false);
    expect(validateFollowDestination("WEBHOOK", "https://")).toBe(false);

    expect(validateFollowDestination("IN_APP", "")).toBe(true);
  });

  it("resets all state between tests", () => {
    followService.follow({ campaignId: CAMPAIGN, followerAddress: ALICE });
    followService.reset();
    expect(followService.getFollowerCount(CAMPAIGN)).toBe(0);
  });
});
