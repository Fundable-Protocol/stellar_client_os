import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CampaignSocialScheduler } from "./CampaignSocialScheduler";
import { resetSocialSchedulerStore } from "@/services/campaign-social-scheduler.service";

const FUTURE_DATE = "2099-11-15";

describe("CampaignSocialScheduler (Issue #1266)", () => {
  beforeEach(() => {
    resetSocialSchedulerStore();
  });

  it("renders creator social account connections for Twitter/X, Facebook, and LinkedIn", () => {
    render(
      <CampaignSocialScheduler
        campaignId="camp-101"
        campaignTitle="Save the Amazon RainForest Reserve"
        initialDateKey={FUTURE_DATE}
      />,
    );

    expect(
      screen.getByText("Creator Settings: Social Media Account Connections"),
    ).toBeTruthy();
    expect(screen.getByTestId("connected-accounts-badge").textContent).toContain(
      "0 / 3 Accounts Connected",
    );

    // Connect Twitter/X
    fireEvent.change(screen.getByTestId("handle-input-twitter"), {
      target: { value: "amazon_reserve" },
    });
    fireEvent.click(screen.getByTestId("connect-btn-twitter"));

    expect(screen.getByTestId("connection-status-twitter").textContent).toBe("Connected");
    expect(screen.getByTestId("connected-accounts-badge").textContent).toContain(
      "1 / 3 Accounts Connected",
    );

    // Connect Facebook & LinkedIn
    fireEvent.change(screen.getByTestId("handle-input-facebook"), {
      target: { value: "facebook.com/amazonreserve" },
    });
    fireEvent.click(screen.getByTestId("connect-btn-facebook"));

    fireEvent.change(screen.getByTestId("handle-input-linkedin"), {
      target: { value: "linkedin.com/company/amazon-reserve" },
    });
    fireEvent.click(screen.getByTestId("connect-btn-linkedin"));

    expect(screen.getByTestId("connected-accounts-badge").textContent).toContain(
      "3 / 3 Accounts Connected",
    );

    // Disconnect Facebook
    fireEvent.click(screen.getByTestId("disconnect-btn-facebook"));
    expect(screen.getByTestId("connection-status-facebook").textContent).toBe(
      "Not Connected",
    );
    expect(screen.getByTestId("connected-accounts-badge").textContent).toContain(
      "2 / 3 Accounts Connected",
    );
  });

  it("renders live post preview before scheduling and updates when copy, hashtags, or presets change", () => {
    render(
      <CampaignSocialScheduler
        campaignId="camp-101"
        campaignTitle="Save the Amazon RainForest Reserve"
        initialDateKey={FUTURE_DATE}
      />,
    );

    expect(screen.getByText("Post Preview Before Scheduling")).toBeTruthy();
    expect(screen.getByTestId("post-preview-card-twitter")).toBeTruthy();
    expect(screen.getByTestId("post-preview-card-facebook")).toBeTruthy();
    expect(screen.getByTestId("post-preview-card-linkedin")).toBeTruthy();

    fireEvent.change(screen.getByTestId("social-post-content-input"), {
      target: { value: "Custom update: 2,000 trees planted this week!" },
    });
    fireEvent.change(screen.getByTestId("social-post-hashtags-input"), {
      target: { value: "#Amazonia, #StellarImpact" },
    });

    const twitterPreviewBody = screen.getByTestId("preview-body-twitter").textContent || "";
    expect(twitterPreviewBody).toContain("Custom update: 2,000 trees planted this week!");
    expect(twitterPreviewBody).toContain("#Amazonia #StellarImpact");

    fireEvent.click(screen.getByTestId("preview-before-schedule-btn"));
    expect(screen.getByTestId("scheduler-feedback").textContent).toContain(
      "Post preview verified across selected platforms",
    );
  });

  it("navigates the calendar UI, selects a calendar date, schedules a post, and cancels it", () => {
    render(
      <CampaignSocialScheduler
        campaignId="camp-101"
        campaignTitle="Save the Amazon RainForest Reserve"
        initialDateKey={FUTURE_DATE}
      />,
    );

    expect(screen.getByTestId("calendar-month-label").textContent).toBe("November 2099");

    // Navigate to December 2099 and back to November 2099
    fireEvent.click(screen.getByTestId("calendar-next-month"));
    expect(screen.getByTestId("calendar-month-label").textContent).toBe("December 2099");
    fireEvent.click(screen.getByTestId("calendar-prev-month"));
    expect(screen.getByTestId("calendar-month-label").textContent).toBe("November 2099");

    // Select November 20, 2099 on the calendar grid
    fireEvent.click(screen.getByTestId("calendar-day-2099-11-20"));
    expect(
      (screen.getByTestId("social-post-date-input") as HTMLInputElement).value,
    ).toBe("2099-11-20");

    // Connect all 3 accounts so scheduling succeeds
    fireEvent.click(screen.getByTestId("connect-btn-twitter"));
    fireEvent.click(screen.getByTestId("connect-btn-facebook"));
    fireEvent.click(screen.getByTestId("connect-btn-linkedin"));

    // Submit the scheduled post
    fireEvent.click(screen.getByTestId("schedule-post-submit-btn"));

    expect(screen.getByTestId("scheduler-feedback").textContent).toContain(
      "Scheduled promotional post for 2099-11-20",
    );
    expect(screen.getByTestId("calendar-day-badges-2099-11-20")).toBeTruthy();
    expect(screen.getByTestId("selected-date-posts-list")).toBeTruthy();

    // Cancel the scheduled post
    const cancelBtn = screen.getByRole("button", { name: /Cancel scheduled post/i });
    fireEvent.click(cancelBtn);
    expect(screen.getByTestId("selected-date-empty")).toBeTruthy();
  });
});
