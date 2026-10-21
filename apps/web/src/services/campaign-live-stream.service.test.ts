import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryCampaignDataSource,
  getCampaign,
  setCampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";
import {
  CampaignLiveStreamError,
  MAX_LIVE_STREAM_TITLE_LENGTH,
  removeCampaignLiveStream,
  setCampaignLiveStream,
} from "./campaign-live-stream.service";

const CREATOR = "GCREATORSTREAMADDRESS";
const OTHER = "GNOTTHECREATORADDRESS";
const YT_ID = "dQw4w9WgXcQ";

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-stream-1",
    creator: CREATOR,
    name: "Campaign with a stream",
    status: "ACTIVE",
    goalAmount: "50000",
    raisedAmount: "0",
    sponsorCount: 0,
    treeCount: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    statusChangedAt: 1_700_000_000_000,
    sponsors: [],
    ...overrides,
  };
}

let dataSource: InMemoryCampaignDataSource;

beforeEach(() => {
  dataSource = new InMemoryCampaignDataSource();
  setCampaignDataSource(dataSource);
});

describe("setCampaignLiveStream", () => {
  it("persists a validated stream in canonical form", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    const updated = await setCampaignLiveStream(
      record.id,
      CREATOR,
      {
        streamUrl: `http://www.youtube.com/watch?v=${YT_ID}&t=42`,
        title: "  Field update from the site  ",
      },
      dataSource,
      1_000,
    );

    expect(updated.liveStream).toEqual({
      platform: "youtube",
      streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
      title: "Field update from the site",
      addedAt: 1_000,
      updatedAt: 1_000,
    });

    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream?.streamUrl).toBe(`https://www.youtube.com/watch?v=${YT_ID}`);
    expect(stored?.updatedAt).toBe(1_000);
  });

  it("persists a validated replay URL alongside the stream", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    const updated = await setCampaignLiveStream(
      record.id,
      CREATOR,
      {
        streamUrl: "https://www.twitch.tv/somechannel",
        replayUrl: "https://www.twitch.tv/videos/987654321",
      },
      dataSource,
      2_000,
    );

    expect(updated.liveStream).toMatchObject({
      platform: "twitch",
      streamUrl: "https://www.twitch.tv/somechannel",
      replayUrl: "https://www.twitch.tv/videos/987654321",
    });
  });

  it("preserves addedAt across updates and refreshes updatedAt", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    const first = await setCampaignLiveStream(
      record.id,
      CREATOR,
      { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` },
      dataSource,
      1_000,
    );
    const second = await setCampaignLiveStream(
      record.id,
      CREATOR,
      { streamUrl: "https://www.twitch.tv/otherchannel", title: "Switched provider" },
      dataSource,
      5_000,
    );

    expect(second.liveStream?.addedAt).toBe(1_000);
    expect(second.liveStream?.updatedAt).toBe(5_000);
    expect(second.liveStream?.platform).toBe("twitch");
    expect(first.liveStream?.platform).toBe("youtube");
  });

  it("rejects writes from anyone who is not the campaign creator", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    await expect(
      setCampaignLiveStream(record.id, OTHER, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` }, dataSource),
    ).rejects.toMatchObject({ name: "CampaignLiveStreamError", code: "FORBIDDEN" });

    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream).toBeUndefined();
  });

  it("requires a requestedBy address", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    for (const requestedBy of [null, undefined, "", "   "]) {
      await expect(
        setCampaignLiveStream(record.id, requestedBy, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` }, dataSource),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("returns NOT_FOUND for an unknown campaign", async () => {
    await expect(
      setCampaignLiveStream("does-not-exist", CREATOR, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` }, dataSource),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects invalid stream URLs with VALIDATION", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    await expect(
      setCampaignLiveStream(record.id, CREATOR, { streamUrl: "https://evil.example.com/live" }, dataSource),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      setCampaignLiveStream(record.id, CREATOR, { streamUrl: "not a url" }, dataSource),
    ).rejects.toBeInstanceOf(CampaignLiveStreamError);
  });

  it("rejects invalid replay URLs with VALIDATION", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    await expect(
      setCampaignLiveStream(
        record.id,
        CREATOR,
        { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`, replayUrl: "https://evil.example.com/replay" },
        dataSource,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects over-long titles", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    await expect(
      setCampaignLiveStream(
        record.id,
        CREATOR,
        {
          streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
          title: "a".repeat(MAX_LIVE_STREAM_TITLE_LENGTH + 1),
        },
        dataSource,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("removeCampaignLiveStream", () => {
  it("removes the stream and its replay link for the creator", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    await setCampaignLiveStream(
      record.id,
      CREATOR,
      { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`, replayUrl: `https://www.youtube.com/watch?v=${YT_ID}` },
      dataSource,
      1_000,
    );

    const removed = await removeCampaignLiveStream(record.id, CREATOR, dataSource, 2_000);
    expect(removed.liveStream).toBeUndefined();
    expect(removed.updatedAt).toBe(2_000);

    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream).toBeUndefined();
  });

  it("is a no-op when no stream is configured", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    const result = await removeCampaignLiveStream(record.id, CREATOR, dataSource, 3_000);
    expect(result.liveStream).toBeUndefined();
    expect(result.updatedAt).toBe(1_700_000_000_000);
  });

  it("rejects removal by non-creators", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    await setCampaignLiveStream(
      record.id,
      CREATOR,
      { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` },
      dataSource,
      1_000,
    );

    await expect(removeCampaignLiveStream(record.id, OTHER, dataSource)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream).toBeDefined();
  });

  it("returns NOT_FOUND for an unknown campaign", async () => {
    await expect(removeCampaignLiveStream("does-not-exist", CREATOR, dataSource)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
