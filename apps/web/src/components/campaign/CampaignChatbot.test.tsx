import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { CampaignChatbot } from "./CampaignChatbot";
import type { CampaignRecord } from "@/services/campaign.service";

describe("CampaignChatbot", () => {
  const mockCampaign: CampaignRecord = {
    id: "campaign-bot-1",
    creator: "GCREATOR999999999",
    creatorEmail: "creator@agroforest.org",
    name: "Mangrove Sanctuary Project",
    status: "ACTIVE",
    goalAmount: "50000",
    raisedAmount: "15000",
    sponsorCount: 12,
    treeCount: 300,
    treeSpecies: "Red Mangrove",
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
    statusChangedAt: Date.now(),
    sponsors: [],
    statusHistory: [],
    faqs: [
      {
        id: "faq-c1",
        question: "Where is the mangrove sanctuary located?",
        answer: "The sanctuary is located along the Rufiji Delta coastline in Tanzania.",
        category: "Location",
      },
      {
        id: "faq-c2",
        question: "Can I donate anonymously?",
        answer: "Yes, this mangrove campaign supports anonymous zero-knowledge donations.",
        category: "Donations",
      },
    ],
  };

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.restoreAllMocks();
  });

  it("is collapsible and starts collapsed by default", () => {
    render(<CampaignChatbot campaign={mockCampaign} />);

    // Open button is visible
    const openButton = screen.getByTestId("chatbot-open-button");
    expect(openButton).toBeTruthy();
    expect(openButton.getAttribute("aria-expanded")).toBe("false");

    // Chat window is not visible initially
    expect(screen.queryByTestId("chatbot-window")).toBeNull();

    // Clicking open expands the chat window
    fireEvent.click(openButton);
    expect(screen.getByTestId("chatbot-window")).toBeTruthy();
    expect(screen.getByText("Campaign Assistant")).toBeTruthy();

    // Clicking collapse closes the chat window
    const collapseButton = screen.getByTestId("chatbot-collapse-button");
    fireEvent.click(collapseButton);
    expect(screen.queryByTestId("chatbot-window")).toBeNull();
  });

  it("can be initialized in open state via initialOpen prop", () => {
    render(<CampaignChatbot campaign={mockCampaign} initialOpen={true} />);
    expect(screen.getByTestId("chatbot-window")).toBeTruthy();
  });

  it("answers common questions from the campaign FAQ section first", () => {
    render(<CampaignChatbot campaign={mockCampaign} initialOpen={true} />);

    const input = screen.getByTestId("chatbot-input");
    const sendButton = screen.getByTestId("chatbot-send-button");

    fireEvent.change(input, {
      target: { value: "Where is the mangrove sanctuary located?" },
    });
    fireEvent.click(sendButton);

    // Should display answer with Campaign FAQ badge
    expect(screen.getByText(/Rufiji Delta coastline in Tanzania/)).toBeTruthy();
    expect(screen.getByTestId("badge-campaign-faq")).toBeTruthy();
  });

  it("prefers campaign FAQ over platform FAQ when topic overlaps", () => {
    render(<CampaignChatbot campaign={mockCampaign} initialOpen={true} />);

    const input = screen.getByTestId("chatbot-input");
    const sendButton = screen.getByTestId("chatbot-send-button");

    // "Can I donate anonymously?" is in both campaign FAQ and platform FAQ
    fireEvent.change(input, { target: { value: "Can I donate anonymously?" } });
    fireEvent.click(sendButton);

    // Campaign-specific answer must be selected
    expect(screen.getByText(/this mangrove campaign supports anonymous zero-knowledge donations/)).toBeTruthy();
    expect(screen.getByTestId("badge-campaign-faq")).toBeTruthy();
  });

  it("pulls answers from platform FAQ when question is not answered in campaign FAQ", () => {
    render(<CampaignChatbot campaign={mockCampaign} initialOpen={true} />);

    const input = screen.getByTestId("chatbot-input");
    const sendButton = screen.getByTestId("chatbot-send-button");

    // This question exists in platform FAQ but not in mockCampaign.faqs
    fireEvent.change(input, {
      target: { value: "How do I withdraw earnings?" },
    });
    fireEvent.click(sendButton);

    expect(screen.getByText(/payment stream that vests gradually/)).toBeTruthy();
    expect(screen.getByTestId("badge-platform-faq")).toBeTruthy();
  });

  it("prompts escalation to creator inbox when question is unanswered", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<CampaignChatbot campaign={mockCampaign} initialOpen={true} />);

    const input = screen.getByTestId("chatbot-input");
    const sendButton = screen.getByTestId("chatbot-send-button");

    // Unrelated question with no FAQ match
    fireEvent.change(input, {
      target: { value: "Can I get customized merchandise shipped internationally?" },
    });
    fireEvent.click(sendButton);

    expect(screen.getByText(/I couldn't find an answer to your question/)).toBeTruthy();
    expect(screen.getByTestId("escalate-card")).toBeTruthy();

    const contactInput = screen.getByTestId("escalate-contact-input");
    fireEvent.change(contactInput, { target: { value: "sponsor@acme.org" } });

    const escalateBtn = screen.getByTestId("escalate-submit-button");
    fireEvent.click(escalateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Your question has been escalated to the creator's inbox/)).toBeTruthy();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `/api/campaigns/${mockCampaign.id}/creator-inbox`,
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("allows asking questions by clicking suggested question chips", () => {
    render(<CampaignChatbot campaign={mockCampaign} initialOpen={true} />);

    const chip = screen.getByTestId("suggested-question-0");
    fireEvent.click(chip);

    // It automatically sends question and receives response
    expect(screen.getByText(/Rufiji Delta coastline in Tanzania/)).toBeTruthy();
  });
});
