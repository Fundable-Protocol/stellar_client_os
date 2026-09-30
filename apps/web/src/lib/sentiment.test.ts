import { describe, expect, it } from "vitest";
import {
  analyzeCampaignSentiment,
  analyzeSentiment,
  labelSentiment,
  tokenize,
  LOW_SENTIMENT_THRESHOLD,
  MIN_COMMENTS_FOR_OUTREACH,
} from "./sentiment";

describe("tokenize", () => {
  it("lowercases, strips punctuation, keeps apostrophes", () => {
    expect(tokenize("Absolutely LOVE it!! Don't stop.")).toEqual([
      "absolutely",
      "love",
      "it",
      "don't",
      "stop",
    ]);
  });
});

describe("analyzeSentiment", () => {
  it("scores clear positive text high", () => {
    expect(analyzeSentiment("This project is amazing, I love the impact!")).toBeGreaterThan(0.3);
  });

  it("scores clear negative text low", () => {
    expect(analyzeSentiment("Terrible communication, totally disappointed and frustrated.")).toBeLessThan(-0.3);
  });

  it("returns ~0 for neutral or empty text", () => {
    expect(analyzeSentiment("The trees are planted in rows")).toBeLessThan(0.15);
    expect(analyzeSentiment("")).toBe(0);
    expect(analyzeSentiment("...")).toBe(0);
  });

  it("handles negation", () => {
    const plain = analyzeSentiment("good");
    const negated = analyzeSentiment("not good");
    expect(plain).toBeGreaterThan(0);
    expect(negated).toBeLessThan(0);
  });

  it("handles intensifiers and downtoners", () => {
    expect(analyzeSentiment("very good")).toBeGreaterThan(analyzeSentiment("good"));
    expect(analyzeSentiment("slightly good")).toBeLessThan(analyzeSentiment("good"));
  });

  it("is symmetric-ish: strong words weigh more", () => {
    expect(analyzeSentiment("amazing")).toBeGreaterThan(analyzeSentiment("good"));
    expect(analyzeSentiment("scam")).toBeLessThan(analyzeSentiment("bad"));
  });

  it("clamps to [-1, 1]", () => {
    const s = analyzeSentiment(
      "amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing amazing",
    );
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("labelSentiment", () => {
  it("maps scores to labels", () => {
    expect(labelSentiment(0.5)).toBe("positive");
    expect(labelSentiment(0)).toBe("neutral");
    expect(labelSentiment(-0.5)).toBe("negative");
  });
});

describe("analyzeCampaignSentiment", () => {
  it("aggregates counts and average", () => {
    const result = analyzeCampaignSentiment("c1", [
      { id: "a", comment: "amazing project, love it" },
      { id: "b", comment: "terrible experience, never again" },
      { id: "c", comment: "trees look healthy and thriving" },
    ]);

    expect(result.total).toBe(3);
    expect(result.counts.positive).toBe(2);
    expect(result.counts.negative).toBe(1);
    expect(result.averageScore).not.toBeNull();
    expect(result.label).toBe("positive");
    expect(result.needsOutreach).toBe(false);
  });

  it("blends rating with text score", () => {
    const withRating = analyzeCampaignSentiment("c1", [
      { id: "a", comment: "the planting day was on tuesday", rating: 5 },
      { id: "b", comment: "the planting day was on tuesday", rating: 1 },
    ]);

    const [five, one] = withRating.comments;
    expect(five.score).toBeGreaterThan(one.score);
    expect(five.label).toBe("positive"); // rating drags neutral text up
    expect(one.label).toBe("negative"); // rating drags neutral text down
  });

  it("flags low-sentiment campaigns for outreach", () => {
    const feedback = [
      { id: "1", comment: "terrible communication, totally ghosted" },
      { id: "2", comment: "stalled for months, very frustrating" },
      { id: "3", comment: "disappointed, I regret this sponsorship" },
      { id: "4", comment: "awful updates, this feels like a scam" },
    ];
    const result = analyzeCampaignSentiment("c2", feedback);

    expect(result.averageScore!).toBeLessThan(LOW_SENTIMENT_THRESHOLD);
    expect(result.needsOutreach).toBe(true);
  });

  it("does not flag without enough comments", () => {
    const result = analyzeCampaignSentiment("c3", [
      { id: "1", comment: "terrible, awful, scam" },
      { id: "2", comment: "very disappointed, frustrated" },
    ]);
    expect(result.total).toBeLessThan(MIN_COMMENTS_FOR_OUTREACH);
    expect(result.needsOutreach).toBe(false);
  });

  it("handles no feedback", () => {
    const result = analyzeCampaignSentiment("c4", []);
    expect(result.label).toBe("no-data");
    expect(result.averageScore).toBeNull();
    expect(result.needsOutreach).toBe(false);
  });
});
