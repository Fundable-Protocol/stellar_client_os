import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignNotificationModal } from "./CampaignNotificationModal";

describe("CampaignNotificationModal (Issue #882)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        frequency: "weekly",
        channel: "email",
        email: "sponsor@green.org",
      }),
    } as any);
  });

  it("does not render when isOpen is false", () => {
    render(
      <CampaignNotificationModal
        campaignId="c1"
        campaignName="Green Earth"
        sponsorId="G_SPONSOR_1"
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders modal with campaign name and loaded preferences", async () => {
    render(
      <CampaignNotificationModal
        campaignId="c1"
        campaignName="Green Earth Reforestation"
        sponsorId="G_SPONSOR_1"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Green Earth Reforestation")).toBeDefined();
    expect(screen.getByText("Campaign Progress Notifications")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByDisplayValue("sponsor@green.org")).toBeDefined();
    });
  });

  it("allows selecting frequency options", async () => {
    render(
      <CampaignNotificationModal
        campaignId="c1"
        campaignName="Green Earth"
        sponsorId="G_SPONSOR_1"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    const dailyBtn = screen.getByText("Daily Digest");
    fireEvent.click(dailyBtn);

    const saveBtn = screen.getByText("Save Preferences");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/campaigns/c1/notifications",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"frequency":"daily"'),
        })
      );
    });
  });

  it("validates invalid email before sending POST", async () => {
    render(
      <CampaignNotificationModal
        campaignId="c1"
        campaignName="Green Earth"
        sponsorId="G_SPONSOR_1"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      const input = screen.getByLabelText("Email Address");
      fireEvent.change(input, { target: { value: "invalid-email" } });
    });

    const saveBtn = screen.getByText("Save Preferences");
    fireEvent.click(saveBtn);

    expect(await screen.findByText("Please enter a valid email address.")).toBeDefined();
  });
});
