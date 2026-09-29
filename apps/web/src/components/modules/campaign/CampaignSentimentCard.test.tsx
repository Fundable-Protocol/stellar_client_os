import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignSentimentCard } from "./CampaignSentimentCard";
import type { CampaignSentiment } from "@/lib/sentiment";

describe("CampaignSentimentCard (Issue #881)", () => {
  const positiveSentiment: CampaignSentiment = {
    campaignId: "campaign-101",
    label: "positive",
    averageScore: 0.85,
    averageRating: 4.8,
    totalFeedback: 25,
    needsOutreach: false,
    distribution: { positive: 22, neutral: 2, negative: 1 },
  };

  const negativeSentiment: CampaignSentiment = {
    campaignId: "campaign-102",
    label: "negative",
    averageScore: -0.45,
    averageRating: 2.1,
    totalFeedback: 14,
    needsOutreach: true,
    distribution: { positive: 2, neutral: 3, negative: 9 },
  };

  it("renders positive sentiment metrics and badge", () => {
    render(<CampaignSentimentCard campaignId="campaign-101" sentiment={positiveSentiment} />);

    expect(screen.getByText("Sponsor Sentiment & Feedback")).toBeInTheDocument();
    expect(screen.getByText("positive")).toBeInTheDocument();
    expect(screen.getByText("0.85")).toBeInTheDocument();
    expect(screen.getByText("4.8 / 5")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.queryByText(/Creator Outreach Recommended/i)).not.toBeInTheDocument();
  });

  it("displays outreach alert banner and triggers outreach action when needsOutreach is true", () => {
    const onInitiateOutreach = jest.fn();
    render(
      <CampaignSentimentCard
        campaignId="campaign-102"
        sentiment={negativeSentiment}
        onInitiateOutreach={onInitiateOutreach}
      />
    );

    expect(screen.getByText("negative")).toBeInTheDocument();
    expect(screen.getByText(/Creator Outreach Recommended/i)).toBeInTheDocument();

    const outreachBtn = screen.getByText("Initiate Outreach");
    fireEvent.click(outreachBtn);

    expect(onInitiateOutreach).toHaveBeenCalledWith("campaign-102");
    expect(screen.getByText("✓ Outreach Initiated")).toBeInTheDocument();
  });
});
