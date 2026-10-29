import { describe, it, expect } from "vitest";
import {
  answerCampaignQuestion,
  getSuggestedQuestions,
  calculateMatchScore,
  extractKeywords,
} from "./campaign-chatbot.service";
import type { CampaignChatbotContext } from "./campaign-chatbot.service";
import type { FaqItem } from "@/components/modules/faq/faqData";

describe("campaign-chatbot.service", () => {
  const mockCampaign: CampaignChatbotContext = {
    id: "campaign-green-belt",
    name: "Amazon Green Belt Reforestation",
    creator: "GCREATOR123456789",
    creatorEmail: "creator@amazonbelt.org",
    faqs: [
      {
        id: "cf-1",
        question: "What species of trees are planted in this campaign?",
        answer: "We plant native Brazilian Rosewood and Mahogany saplings adapted to the rainforest canopy.",
        category: "Ecology",
      },
      {
        id: "cf-2",
        question: "How do you track planting progress?",
        answer: "We use weekly drone photography and on-ground GPS coordinates verified on-chain.",
        category: "Verification",
      },
      {
        id: "cf-3",
        question: "Can I donate anonymously?",
        answer: "For this specific campaign, all donations can be completely anonymous via zero-knowledge proofs.",
        category: "Privacy",
      },
    ],
  };

  const mockPlatformFaqs: FaqItem[] = [
    {
      id: "pf-1",
      category: "General",
      question: "What does this platform do?",
      answer: "Sponsors fund tree-planting and impact campaigns, and planters get paid for verified work over time.",
    },
    {
      id: "pf-2",
      category: "Privacy & Verification",
      question: "Can I donate anonymously?",
      answer: "Yes. Anonymous donations use cryptographic zero-knowledge nullifiers on Stellar.",
    },
    {
      id: "pf-3",
      category: "For Planters",
      question: "How do I withdraw earnings?",
      answer: "Earnings arrive through a payment stream that vests gradually over the stream's schedule.",
    },
  ];

  describe("extractKeywords and calculateMatchScore", () => {
    it("extracts words while filtering out common stop words", () => {
      const keywords = extractKeywords("What species of trees are being planted?");
      expect(keywords).toContain("species");
      expect(keywords).toContain("trees");
      expect(keywords).toContain("planted");
      expect(keywords).not.toContain("what");
      expect(keywords).not.toContain("of");
      expect(keywords).not.toContain("are");
    });

    it("calculates high match score for identical questions", () => {
      const score = calculateMatchScore(
        "What species of trees are planted in this campaign?",
        "What species of trees are planted in this campaign?",
        "Answer content here",
      );
      expect(score).toBe(1.0);
    });

    it("calculates positive score for partial keyword matches", () => {
      const score = calculateMatchScore(
        "Which tree species?",
        "What species of trees are planted in this campaign?",
        "Answer content",
      );
      expect(score).toBeGreaterThan(0.3);
    });
  });

  describe("answerCampaignQuestion precedence", () => {
    it("pulls answers from campaign FAQ section first when question exists in both campaign and platform FAQ", () => {
      // "Can I donate anonymously?" is in BOTH mockCampaign.faqs and mockPlatformFaqs
      const result = answerCampaignQuestion(
        "Can I donate anonymously?",
        mockCampaign,
        mockPlatformFaqs,
      );

      expect(result.answered).toBe(true);
      expect(result.source).toBe("campaign_faq");
      expect(result.answer).toContain("For this specific campaign");
      expect(result.canEscalate).toBe(false);
    });

    it("pulls answers from campaign FAQ for campaign-specific questions", () => {
      const result = answerCampaignQuestion(
        "What tree species are you planting?",
        mockCampaign,
        mockPlatformFaqs,
      );

      expect(result.answered).toBe(true);
      expect(result.source).toBe("campaign_faq");
      expect(result.answer).toContain("Brazilian Rosewood and Mahogany");
      expect(result.matchedQuestion).toBe("What species of trees are planted in this campaign?");
      expect(result.canEscalate).toBe(false);
    });

    it("falls back to platform FAQ when question is not answered in campaign FAQ", () => {
      const result = answerCampaignQuestion(
        "How do I withdraw earnings as a planter?",
        mockCampaign,
        mockPlatformFaqs,
      );

      expect(result.answered).toBe(true);
      expect(result.source).toBe("platform_faq");
      expect(result.answer).toContain("payment stream that vests gradually");
      expect(result.matchedQuestion).toBe("How do I withdraw earnings?");
      expect(result.canEscalate).toBe(false);
    });

    it("returns unanswered with canEscalate=true when question is not found in either FAQ", () => {
      const result = answerCampaignQuestion(
        "Will you offer discounts on merchandise for early bird backers?",
        mockCampaign,
        mockPlatformFaqs,
      );

      expect(result.answered).toBe(false);
      expect(result.source).toBeUndefined();
      expect(result.answer).toBeUndefined();
      expect(result.canEscalate).toBe(true);
    });

    it("handles empty or whitespace query gracefully", () => {
      const result = answerCampaignQuestion("   ", mockCampaign, mockPlatformFaqs);
      expect(result.answered).toBe(false);
      expect(result.canEscalate).toBe(false);
    });
  });

  describe("getSuggestedQuestions", () => {
    it("prioritizes campaign FAQ questions before platform FAQ questions", () => {
      const suggested = getSuggestedQuestions(mockCampaign, mockPlatformFaqs, 4);

      expect(suggested.length).toBeLessThanOrEqual(4);
      // First questions should be from campaign FAQ
      expect(suggested[0]).toBe("What species of trees are planted in this campaign?");
      expect(suggested[1]).toBe("How do you track planting progress?");
    });

    it("fills remainder from platform FAQ if campaign has fewer FAQs than max", () => {
      const campaignWithFewFaqs: CampaignChatbotContext = {
        id: "camp-short",
        faqs: [{ question: "Only one question here?", answer: "Yes." }],
      };

      const suggested = getSuggestedQuestions(campaignWithFewFaqs, mockPlatformFaqs, 3);
      expect(suggested).toHaveLength(3);
      expect(suggested[0]).toBe("Only one question here?");
      expect(suggested[1]).toBe("What does this platform do?");
    });
  });
});
