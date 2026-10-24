import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  escalateToCreatorInbox,
  getCreatorInboxMessages,
  clearCreatorInbox,
} from "./creator-inbox.service";

describe("creator-inbox.service", () => {
  beforeEach(() => {
    clearCreatorInbox();
  });

  it("escalates a question and stores it in the creator inbox", async () => {
    const message = await escalateToCreatorInbox({
      campaignId: "campaign-123",
      creatorAddress: "GCREATOR12345",
      question: "When is the next planting season starting?",
      backerContact: "backer@example.com",
    });

    expect(message.id).toBeDefined();
    expect(message.campaignId).toBe("campaign-123");
    expect(message.creatorAddress).toBe("GCREATOR12345");
    expect(message.question).toBe("When is the next planting season starting?");
    expect(message.backerContact).toBe("backer@example.com");
    expect(message.status).toBe("unread");
    expect(message.escalatedFrom).toBe("campaign_chatbot");

    const messages = getCreatorInboxMessages("GCREATOR12345");
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe(message.id);
  });

  it("filters inbox messages by campaignId or creatorAddress", async () => {
    await escalateToCreatorInbox({
      campaignId: "camp-A",
      creatorAddress: "CREATOR-A",
      question: "Question for Camp A",
    });

    await escalateToCreatorInbox({
      campaignId: "camp-B",
      creatorAddress: "CREATOR-B",
      question: "Question for Camp B",
    });

    const forCampA = getCreatorInboxMessages("camp-A");
    expect(forCampA).toHaveLength(1);
    expect(forCampA[0].campaignId).toBe("camp-A");

    const forCreatorB = getCreatorInboxMessages("CREATOR-B");
    expect(forCreatorB).toHaveLength(1);
    expect(forCreatorB[0].campaignId).toBe("camp-B");
  });

  it("sends an email to the creator if creatorEmail is provided", async () => {
    const mockEmailer = {
      sendEmail: vi.fn().mockResolvedValue(true),
    };

    await escalateToCreatorInbox(
      {
        campaignId: "camp-email",
        creatorAddress: "CREATOR-EMAIL",
        creatorEmail: "creator@agroforestry.io",
        question: "Can organizations get invoices?",
        backerContact: "sponsor@corp.com",
      },
      mockEmailer,
    );

    expect(mockEmailer.sendEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailer.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "creator@agroforestry.io",
        subject: expect.stringContaining("Question from backer"),
        html: expect.stringContaining("Can organizations get invoices?"),
      }),
    );
  });

  it("throws an error when required fields are missing", async () => {
    await expect(
      escalateToCreatorInbox({
        campaignId: "",
        creatorAddress: "CREATOR",
        question: "Valid question",
      }),
    ).rejects.toThrow("campaignId is required");

    await expect(
      escalateToCreatorInbox({
        campaignId: "camp",
        creatorAddress: "CREATOR",
        question: "",
      }),
    ).rejects.toThrow("question is required");
  });
});
