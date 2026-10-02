import { describe, expect, it } from "vitest";
import {
  InMemoryCampaignDataSource,
  createCampaign,
} from "./campaign.service";
import {
  DEFAULT_STRETCH_WINDOW_MS,
  addCampaignStretchGoal,
  applyContributionAndUnlockStretchGoals,
  evaluateStretchGoalStatus,
  getUnlockedRewardsForBackers,
  isMainGoalReached,
  isWithinStretchWindow,
  syncCampaignStretchGoals,
} from "./campaign-stretch-goals.service";

describe("campaign stretch goals", () => {
  const HOUR = 60 * 60 * 1000;

  it("defaults the stretch window to 24 hours", () => {
    expect(DEFAULT_STRETCH_WINDOW_MS).toBe(24 * HOUR);
  });

  it("detects when the main goal is reached", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = await createCampaign(
      { creator: "GCREATOR", name: "Trees", goalAmount: "1000" },
      source,
      1,
    );
    expect(isMainGoalReached(campaign)).toBe(false);
    expect(isMainGoalReached({ ...campaign, raisedAmount: "1000" })).toBe(true);
    expect(isMainGoalReached({ ...campaign, raisedAmount: "999" })).toBe(false);
  });

  it("treats the window as [start, end)", () => {
    const goal = { windowStartsAt: 100, windowEndsAt: 200 };
    expect(isWithinStretchWindow(goal, 99)).toBe(false);
    expect(isWithinStretchWindow(goal, 100)).toBe(true);
    expect(isWithinStretchWindow(goal, 199)).toBe(true);
    expect(isWithinStretchWindow(goal, 200)).toBe(false);
  });

  it("lets the creator attach a 24-hour bonus stretch goal", async () => {
    const source = new InMemoryCampaignDataSource();
    const t0 = 1_700_000_000_000;
    const campaign = await createCampaign(
      { creator: "GCREATOR", name: "Trees", goalAmount: "1000" },
      source,
      t0,
    );

    const stretch = await addCampaignStretchGoal(
      campaign.id,
      "GCREATOR",
      {
        title: "24-hour flash bonus",
        description: "Hit the main goal in 24h for a limited print",
        durationMs: DEFAULT_STRETCH_WINDOW_MS,
        rewards: [{ title: "Limited edition print", description: "Signed by the team" }],
      },
      source,
      t0,
    );

    expect(stretch.status).toBe("pending");
    expect(stretch.windowEndsAt - stretch.windowStartsAt).toBe(DEFAULT_STRETCH_WINDOW_MS);
    expect(stretch.rewards).toHaveLength(1);
  });

  it("rejects stretch goals from anyone but the creator", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = await createCampaign(
      { creator: "GCREATOR", name: "Trees", goalAmount: "1000" },
      source,
      1,
    );
    await expect(
      addCampaignStretchGoal(
        campaign.id,
        "GSTRANGER",
        { title: "Nope", rewards: [{ title: "x" }] },
        source,
        2,
      ),
    ).rejects.toThrow(/creator/i);
  });

  it("unlocks special rewards when the main goal is hit inside the window", async () => {
    const source = new InMemoryCampaignDataSource();
    const t0 = 1_000;
    const campaign = await createCampaign(
      { creator: "GCREATOR", name: "Trees", goalAmount: "1000" },
      source,
      t0,
    );
    await addCampaignStretchGoal(
      campaign.id,
      "GCREATOR",
      {
        title: "Flash bonus",
        durationMs: 24 * HOUR,
        rewards: [{ title: "Bonus NFT" }],
      },
      source,
      t0,
    );

    const { unlocked, campaign: funded } = await applyContributionAndUnlockStretchGoals(
      campaign.id,
      "1000",
      source,
      t0 + HOUR,
    );

    expect(unlocked).toHaveLength(1);
    expect(unlocked[0].status).toBe("unlocked");
    expect(getUnlockedRewardsForBackers(funded, t0 + HOUR).map((r) => r.title)).toEqual([
      "Bonus NFT",
    ]);
  });

  it("does not unlock if the main goal is reached after the window", async () => {
    const source = new InMemoryCampaignDataSource();
    const t0 = 1_000;
    const campaign = await createCampaign(
      { creator: "GCREATOR", name: "Trees", goalAmount: "1000" },
      source,
      t0,
    );
    await addCampaignStretchGoal(
      campaign.id,
      "GCREATOR",
      {
        title: "Flash bonus",
        durationMs: 24 * HOUR,
        rewards: [{ title: "Bonus NFT" }],
      },
      source,
      t0,
    );

    const afterWindow = t0 + 24 * HOUR + 1;
    const { unlocked, campaign: funded } = await applyContributionAndUnlockStretchGoals(
      campaign.id,
      "1000",
      source,
      afterWindow,
    );

    expect(unlocked).toHaveLength(0);
    expect(funded.stretchGoals?.[0].status).toBe("expired");
    expect(getUnlockedRewardsForBackers(funded, afterWindow)).toEqual([]);
  });

  it("expires pending goals once the window closes without the main goal", async () => {
    const source = new InMemoryCampaignDataSource();
    const t0 = 5_000;
    const campaign = await createCampaign(
      { creator: "GCREATOR", name: "Trees", goalAmount: "1000" },
      source,
      t0,
    );
    await addCampaignStretchGoal(
      campaign.id,
      "GCREATOR",
      { title: "Flash", durationMs: HOUR, rewards: [{ title: "Sticker" }] },
      source,
      t0,
    );

    const synced = await syncCampaignStretchGoals(campaign.id, source, t0 + HOUR + 1);
    expect(synced[0].status).toBe("expired");
  });

  it("keeps an already-unlocked goal unlocked after the window ends", () => {
    const campaign = {
      id: "c1",
      creator: "G",
      name: "n",
      status: "ACTIVE" as const,
      goalAmount: "100",
      raisedAmount: "100",
      sponsorCount: 1,
      treeCount: 0,
      createdAt: 1,
      updatedAt: 1,
      statusChangedAt: 1,
      sponsors: [],
      statusHistory: [],
    };
    const unlocked = evaluateStretchGoalStatus(
      {
        id: "s1",
        campaignId: "c1",
        title: "Flash",
        windowStartsAt: 0,
        windowEndsAt: 10,
        rewards: [{ id: "r1", title: "NFT" }],
        status: "unlocked",
        unlockedAt: 5,
        createdBy: "G",
        createdAt: 0,
      },
      campaign,
      99,
    );
    expect(unlocked.status).toBe("unlocked");
  });

  it("requires a title and at least one reward", async () => {
    const source = new InMemoryCampaignDataSource();
    const campaign = await createCampaign(
      { creator: "GCREATOR", name: "Trees", goalAmount: "1000" },
      source,
      1,
    );
    await expect(
      addCampaignStretchGoal(campaign.id, "GCREATOR", { title: " ", rewards: [{ title: "x" }] }, source, 2),
    ).rejects.toThrow(/title/i);
    await expect(
      addCampaignStretchGoal(campaign.id, "GCREATOR", { title: "Flash", rewards: [] }, source, 2),
    ).rejects.toThrow(/reward/i);
  });
});
