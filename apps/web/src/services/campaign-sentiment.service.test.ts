import { beforeEach, describe, expect, it } from "vitest";
import {
  analyzeCampaign,
  getCampaignSentiment,
  getOutreachList,
  getSentimentSummary,
  setSentimentDataSource,
  InMemorySentimentDataSource,
} from "./campaign-sentiment.service";

beforeEach(() => setSentimentDataSource(new InMemorySentimentDataSource()));

describe("campaign-sentiment service", () => {
  it("stores and retrieves analyses", async () => {
    await analyzeCampaign("c1", [
      { id: "1", comment: "wonderful experience, grateful" },
      { id: "2", comment: "trees are thriving" },
    ]);

    const record = await getCampaignSentiment("c1");
    expect(record).not.toBeNull();
    expect(record!.campaignId).toBe("c1");
    expect(record!.sentiment.total).toBe(2);
    expect(record!.analyzedAt).toBeGreaterThan(0);
  });

  it("returns null for unanalyzed campaigns", async () => {
    expect(await getCampaignSentiment("ghost")).toBeNull();
  });

  it("re-analysis overwrites the stored record", async () => {
    await analyzeCampaign("c1", [{ id: "1", comment: "amazing" }]);
    await analyzeCampaign("c1", [{ id: "1", comment: "terrible" }]);
    const record = await getCampaignSentiment("c1");
    expect(record!.sentiment.counts.negative).toBe(1);
    expect(record!.sentiment.counts.positive).toBe(0);
  });

  it("orders the outreach list worst-first and excludes healthy campaigns", async () => {
    await analyzeCampaign("bad", [
      { id: "1", comment: "terrible communication, totally ghosted" },
      { id: "2", comment: "stalled for months, very frustrating" },
      { id: "3", comment: "disappointed, I regret this" },
    ]);
    await analyzeCampaign("worse", [
      { id: "1", comment: "awful scam, disgusting treatment of sponsors" },
      { id: "2", comment: "horrible and unacceptable, I hate this" },
      { id: "3", comment: "terrible, failing, wasted money" },
    ]);
    await analyzeCampaign("good", [
      { id: "1", comment: "amazing, love it" },
      { id: "2", comment: "wonderful and impactful" },
    ]);

    const list = await getOutreachList();
    expect(list.map((r) => r.campaignId)).toEqual(["worse", "bad"]);
    expect(list[0].sentiment.averageScore!).toBeLessThan(list[1].sentiment.averageScore!);
  });

  it("summarizes label distribution and flagged counts", async () => {
    await analyzeCampaign("pos", [{ id: "1", comment: "amazing" }, { id: "2", comment: "love" }]);
    await analyzeCampaign("neg", [
      { id: "1", comment: "terrible, frustrating" },
      { id: "2", comment: "stalled, disappointed" },
      { id: "3", comment: "ghosted, regret" },
    ]);
    await analyzeCampaign("empty", []);

    const summary = await getSentimentSummary();
    expect(summary.campaigns).toBe(3);
    expect(summary.withData).toBe(2);
    expect(summary.flagged).toBe(1);
    expect(summary.labels.positive).toBe(1);
    expect(summary.labels.negative).toBe(1);
    expect(summary.labels.noData).toBe(1);
  });
});
