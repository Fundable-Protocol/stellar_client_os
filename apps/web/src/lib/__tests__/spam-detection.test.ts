import { describe, it, expect } from "vitest";
import { detectSpam, moderateBatch, computeModerationStats } from "../spam-detection";

describe("spam detection", () => {
  describe("detectSpam", () => {
    it("returns low score for normal questions", () => {
      const result = detectSpam(
        "What percentage of funds goes directly to the community?",
        true,
      );
      expect(result.score).toBeLessThan(30);
      expect(result.action).toBe("approve");
      expect(result.severity).toBe("none");
    });

    it("flags excessive uppercase text", () => {
      const result = detectSpam(
        "THIS IS ALL CAPS AND VERY LOUD TEXT SHOUTING AT YOU",
        false,
      );
      expect(result.score).toBeGreaterThan(20);
      const capsSignal = result.signals.find((s) => s.name === "excessive_caps");
      expect(capsSignal?.triggered).toBe(true);
    });

    it("detects URL shorteners as spam", () => {
      const result = detectSpam(
        "Check out bit.ly/freexlm for free tokens!",
        false,
      );
      expect(result.score).toBeGreaterThan(40);
      const urlSignal = result.signals.find((s) => s.name === "url_shortener");
      expect(urlSignal?.triggered).toBe(true);
    });

    it("detects phishing keywords", () => {
      const result = detectSpam(
        "Click here to claim your 10000 XLM reward now!!!",
        false,
      );
      expect(result.score).toBeGreaterThan(50);
      const phishingSignal = result.signals.find((s) => s.name === "financial_scam_keywords");
      expect(phishingSignal?.triggered).toBe(true);
    });

    it("detects spammy phrases", () => {
      const result = detectSpam("DM me for the airdrop details", false);
      expect(result.score).toBeGreaterThan(20);
      const phraseSignal = result.signals.find((s) => s.name === "spammy_phrases");
      expect(phraseSignal?.triggered).toBe(true);
    });

    it("detects repetitive characters", () => {
      const result = detectSpam("AMAZING!!!!!! so great", false);
      expect(result.score).toBeGreaterThan(10);
      const repSignal = result.signals.find((s) => s.name === "repetitive_characters");
      expect(repSignal?.triggered).toBe(true);
    });

    it("flags short content with links", () => {
      const result = detectSpam("Visit https://spam.com", false);
      expect(result.score).toBeGreaterThan(20);
      const shortSignal = result.signals.find((s) => s.name === "short_content_with_link");
      expect(shortSignal?.triggered).toBe(true);
    });

    it("penalizes non-verified backers", () => {
      const result = detectSpam("Hello world", false);
      const unverifiedSignal = result.signals.find((s) => s.name === "unverified_author");
      expect(unverifiedSignal?.triggered).toBe(true);
    });

    it("does not penalize verified backers", () => {
      const result = detectSpam("Hello world", true);
      const unverifiedSignal = result.signals.find((s) => s.name === "unverified_author");
      expect(unverifiedSignal?.triggered).toBe(false);
    });

    it("detects ALL-CAPS individual words", () => {
      const result = detectSpam("FREE MONEY NOW GUARANTEED ACT FAST", false);
      const capsWordSignal = result.signals.find((s) => s.name === "all_caps_words");
      expect(capsWordSignal?.triggered).toBe(true);
    });

    it("detects emoji spam", () => {
      const result = detectSpam("Great project 🎉🎉🎉🎉🎉🎉🎉", false);
      const emojiSignal = result.signals.find((s) => s.name === "emoji_spam");
      expect(emojiSignal?.triggered).toBe(true);
    });

    it("gives critical severity for clearly spam text", () => {
      const result = detectSpam(
        "FREE XLM!!! Click here to claim your 10000 XLM reward now!!! bit.ly/scam DM me",
        false,
      );
      expect(result.severity).toBe("critical");
      expect(result.action).toBe("hide");
      expect(result.score).toBeGreaterThanOrEqual(80);
    });

    it("returns none severity for clean text", () => {
      const result = detectSpam(
        "How will the funds be allocated across the different project phases?",
        true,
      );
      expect(result.severity).toBe("none");
      expect(result.action).toBe("approve");
    });
  });

  describe("moderateBatch", () => {
    it("returns only items needing moderation", () => {
      const items = [
        { id: "q1", content: "Normal question?", isVerifiedBacker: true },
        { id: "q2", content: "FREE XLM!!! bit.ly/scam", isVerifiedBacker: false },
        { id: "q3", content: "How do I contribute?", isVerifiedBacker: false },
      ];
      const results = moderateBatch(items);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.id === "q2")).toBe(true);
    });

    it("returns empty array when all items are clean", () => {
      const items = [
        { id: "q1", content: "What is the timeline?", isVerifiedBacker: true },
        { id: "q2", content: "Can I get a refund?", isVerifiedBacker: true },
      ];
      const results = moderateBatch(items);
      expect(results).toHaveLength(0);
    });
  });

  describe("computeModerationStats", () => {
    it("computes correct stats", () => {
      const verdicts = [
        { action: "flag" as const, score: 60 },
        { action: "hide" as const, score: 90 },
        { action: "approve" as const, score: 10 },
      ];
      const stats = computeModerationStats(verdicts);
      expect(stats.flagged).toBe(1);
      expect(stats.hidden).toBe(1);
      expect(stats.avgScore).toBe(53);
    });

    it("handles empty array", () => {
      const stats = computeModerationStats([]);
      expect(stats.flagged).toBe(0);
      expect(stats.hidden).toBe(0);
      expect(stats.avgScore).toBe(0);
    });
  });
});
