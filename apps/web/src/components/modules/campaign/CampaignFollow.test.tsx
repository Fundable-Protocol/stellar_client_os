import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignFollow } from "./CampaignFollow";

describe("CampaignFollow Component (Issue #874)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ following: false, followerCount: 15 }),
    } as any);
  });

  it("renders email input and follow button", () => {
    render(<CampaignFollow campaignId="camp-100" />);

    expect(screen.getByPlaceholderText(/Enter your email/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Follow for updates/i })).toBeDefined();
  });

  it("submits email to follow campaign without sponsoring", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ following: true, followerCount: 16 }),
    });

    render(<CampaignFollow campaignId="camp-100" />);

    const input = screen.getByPlaceholderText(/Enter your email/i);
    fireEvent.change(input, { target: { value: "follower@example.com" } });

    const submitBtn = screen.getByRole("button", { name: /Follow for updates/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/campaigns/camp-100/follow",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "follower@example.com" }),
        })
      );
    });
  });

  it("loads stored email and following status from localStorage", async () => {
    window.localStorage.setItem("campaign-follow-email:camp-100", "stored@example.com");

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ following: true, followerCount: 20 }),
    });

    render(<CampaignFollow campaignId="camp-100" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("stored@example.com")).toBeDefined();
    });
  });
});
