import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCampaignFollow } from "./use-campaign-follow";
import { followService } from "@/services/campaign-follow.service";

const CAMPAIGN = "camp-hook-test";
const ALICE = "GALICE...AAAA";

beforeEach(() => followService.reset());

describe("useCampaignFollow", () => {
  it("reports not-following with default in-app prefs before any action", () => {
    const { result } = renderHook(() =>
      useCampaignFollow({ campaignId: CAMPAIGN, currentUserAddress: ALICE })
    );

    expect(result.current.isFollowing()).toBe(false);
    expect(result.current.getFollow()).toBeNull();
    expect(result.current.followerCount).toBe(0);
    expect(result.current.defaultPrefs.channel).toBe("IN_APP");
  });

  it("follows and refreshes the follower count", () => {
    const { result } = renderHook(() =>
      useCampaignFollow({ campaignId: CAMPAIGN, currentUserAddress: ALICE })
    );

    act(() => {
      result.current.follow();
    });

    expect(result.current.isFollowing()).toBe(true);
    expect(result.current.followerCount).toBe(1);
    expect(result.current.getFollow()?.prefs.channel).toBe("IN_APP");
  });

  it("surfaces validation errors without throwing", () => {
    const { result } = renderHook(() =>
      useCampaignFollow({ campaignId: CAMPAIGN, currentUserAddress: ALICE })
    );

    let outcome: { ok: boolean; error?: string } | undefined;
    act(() => {
      outcome = result.current.follow({ channel: "EMAIL" });
    });

    expect(outcome?.ok).toBe(false);
    expect(outcome?.error).toMatch(/Invalid destination for Email/);
    expect(result.current.isFollowing()).toBe(false);
  });

  it("updates prefs and unfollows", () => {
    const { result } = renderHook(() =>
      useCampaignFollow({ campaignId: CAMPAIGN, currentUserAddress: ALICE })
    );

    act(() => {
      result.current.follow();
    });
    act(() => {
      result.current.updatePrefs({ frequency: "WEEKLY_DIGEST" });
    });
    expect(result.current.getFollow()?.prefs.frequency).toBe("WEEKLY_DIGEST");

    act(() => {
      result.current.unfollow();
    });
    expect(result.current.isFollowing()).toBe(false);
    expect(result.current.followerCount).toBe(0);
  });

  it("scopes state to the campaign id", () => {
    followService.follow({ campaignId: "other-campaign", followerAddress: ALICE });

    const { result, rerender } = renderHook(
      ({ campaignId }) =>
        useCampaignFollow({ campaignId, currentUserAddress: ALICE }),
      { initialProps: { campaignId: CAMPAIGN } }
    );
    expect(result.current.followerCount).toBe(0);

    rerender({ campaignId: "other-campaign" });
    expect(result.current.followerCount).toBe(1);
  });
});
