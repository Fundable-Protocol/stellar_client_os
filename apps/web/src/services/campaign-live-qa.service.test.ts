import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCampaignLiveQuestion,
  answerCampaignLiveQuestion,
  getCampaignLiveQASession,
  scheduleCampaignLiveQA,
  upvoteCampaignLiveQuestion,
} from "@/services/campaign-live-qa.service";

describe("campaign live Q&A service", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("schedules a topic and allows questions and unique upvotes before the session", () => {
    const campaignId = `campaign-${crypto.randomUUID()}`;
    scheduleCampaignLiveQA({
      campaignId,
      topic: "Project milestones",
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      actorAddress: "creator-address",
    });

    const question = addCampaignLiveQuestion({
      campaignId,
      content: "When does field work begin?",
      actorAddress: "backer-address",
    });
    upvoteCampaignLiveQuestion({ campaignId, questionId: question.id, actorAddress: "other-backer" });
    upvoteCampaignLiveQuestion({ campaignId, questionId: question.id, actorAddress: "other-backer" });

    expect(getCampaignLiveQASession(campaignId)?.questions[0].upvotes).toBe(1);
  });

  it("allows only the session creator to answer during the live window", () => {
    const campaignId = `campaign-${crypto.randomUUID()}`;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    scheduleCampaignLiveQA({
      campaignId,
      topic: "Project milestones",
      scheduledAt: "2026-10-20T11:30:00.000Z",
      actorAddress: "creator-address",
    });
    const question = addCampaignLiveQuestion({
      campaignId,
      content: "When does field work begin?",
      actorAddress: "backer-address",
    });

    expect(() => answerCampaignLiveQuestion({
      campaignId,
      questionId: question.id,
      content: "Soon",
      actorAddress: "backer-address",
    })).toThrow("Only the creator can answer questions.");
    expect(answerCampaignLiveQuestion({
      campaignId,
      questionId: question.id,
      content: "Field work starts next month.",
      actorAddress: "creator-address",
    }).answer?.content).toBe("Field work starts next month.");
  });
});