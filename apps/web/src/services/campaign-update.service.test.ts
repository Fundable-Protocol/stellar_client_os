import { beforeEach, describe, expect, it } from "vitest";
import {
  CampaignUpdateValidationError,
  countCampaignUpdates,
  createCampaignUpdate,
  deleteCampaignUpdate,
  getCampaignUpdate,
  getCampaignUpdateDataSource,
  listCampaignUpdates,
  publishCampaignUpdate,
  resetCampaignUpdateDataSource,
  updateCampaignUpdate,
} from "./campaign-update.service";

const CAMPAIGN_ID = "camp-101";
const CREATOR = "GD6W...X892";

describe("campaign update service", () => {
  beforeEach(() => {
    resetCampaignUpdateDataSource();
  });

  it("creates a draft update with a generated excerpt", async () => {
    const update = await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "  First field report  ",
      bodyMarkdown: "# Hello\n\nWe planted **120** trees.",
    });

    expect(update.status).toBe("draft");
    expect(update.title).toBe("First field report");
    expect(update.publishedAt).toBeUndefined();
    expect(update.excerpt).toBe("Hello We planted 120 trees.");
    expect(update.imageUrls).toEqual([]);
  });

  it("rejects an update without a title or body", async () => {
    await expect(
      createCampaignUpdate({
        campaignId: CAMPAIGN_ID,
        creatorAddress: CREATOR,
        title: "",
        bodyMarkdown: "body",
      }),
    ).rejects.toBeInstanceOf(CampaignUpdateValidationError);

    await expect(
      createCampaignUpdate({
        campaignId: CAMPAIGN_ID,
        creatorAddress: CREATOR,
        title: "title",
        bodyMarkdown: "   ",
      }),
    ).rejects.toBeInstanceOf(CampaignUpdateValidationError);
  });

  it("rejects more images than the limit allows", async () => {
    const result = await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "title",
      bodyMarkdown: "body",
      imageUrls: Array.from({ length: 11 }, (_, index) => `https://cdn/${index}.png`),
    }).catch((error) => error);

    expect(result).toBeInstanceOf(CampaignUpdateValidationError);
  });

  it("returns updates in chronological order by default", async () => {
    await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "first",
      bodyMarkdown: "one",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "second",
      bodyMarkdown: "two",
    });

    const updates = await listCampaignUpdates({ campaignId: CAMPAIGN_ID });
    expect(updates.map((update) => update.title)).toEqual(["first", "second"]);

    const reversed = await listCampaignUpdates(
      { campaignId: CAMPAIGN_ID },
      { order: "reverse_chronological" },
    );
    expect(reversed.map((update) => update.title)).toEqual(["second", "first"]);
  });

  it("publishes an update and stamps the publication time", async () => {
    const draft = await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "draft",
      bodyMarkdown: "body",
    });

    expect(draft.status).toBe("draft");
    const published = await publishCampaignUpdate(draft.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeGreaterThan(0);

    const fetched = await getCampaignUpdate(draft.id);
    expect(fetched?.status).toBe("published");
  });

  it("keeps the original publication time when republished", async () => {
    const draft = await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "draft",
      bodyMarkdown: "body",
    });
    const first = await publishCampaignUpdate(draft.id);
    const second = await publishCampaignUpdate(draft.id);
    expect(second.publishedAt).toBe(first.publishedAt);
  });

  it("edits an update without changing its status", async () => {
    const draft = await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "draft",
      bodyMarkdown: "body",
    });

    const updated = await updateCampaignUpdate(draft.id, {
      title: "edited",
      bodyMarkdown: "new body",
      imageUrls: ["https://cdn.example.com/a.png"],
      visibility: "backers_only",
    });

    expect(updated.title).toBe("edited");
    expect(updated.bodyMarkdown).toBe("new body");
    expect(updated.imageUrls).toEqual(["https://cdn.example.com/a.png"]);
    expect(updated.visibility).toBe("backers_only");
    expect(updated.status).toBe("draft");
  });

  it("deletes an update", async () => {
    const draft = await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "draft",
      bodyMarkdown: "body",
    });

    expect(await deleteCampaignUpdate(draft.id)).toBe(true);
    expect(await getCampaignUpdate(draft.id)).toBeNull();
  });

  it("counts updates matching a filter", async () => {
    await createCampaignUpdate({
      campaignId: CAMPAIGN_ID,
      creatorAddress: CREATOR,
      title: "a",
      bodyMarkdown: "body",
    });
    await createCampaignUpdate({
      campaignId: "camp-202",
      creatorAddress: CREATOR,
      title: "b",
      bodyMarkdown: "body",
    });

    expect(await countCampaignUpdates({ campaignId: CAMPAIGN_ID })).toBe(1);
    expect(await countCampaignUpdates({})).toBe(2);
  });

  it("keeps updates of different campaigns separate", async () => {
    const a = await createCampaignUpdate({
      campaignId: "camp-a",
      creatorAddress: CREATOR,
      title: "a",
      bodyMarkdown: "body",
    });
    const b = await createCampaignUpdate({
      campaignId: "camp-b",
      creatorAddress: CREATOR,
      title: "b",
      bodyMarkdown: "body",
    });

    expect(a.id).not.toBe(b.id);
    const forA = await listCampaignUpdates({ campaignId: "camp-a" });
    expect(forA).toHaveLength(1);
    expect(forA[0].campaignId).toBe("camp-a");
  });

  it("uses the injected data source", async () => {
    const dataSource = getCampaignUpdateDataSource();
    await createCampaignUpdate(
      {
        campaignId: CAMPAIGN_ID,
        creatorAddress: CREATOR,
        title: "custom",
        bodyMarkdown: "body",
      },
      dataSource,
    );
    expect(await countCampaignUpdates({ campaignId: CAMPAIGN_ID }, dataSource)).toBe(1);
  });
});
