import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackerNotificationPreferencePanel } from "./BackerNotificationPreferencePanel";

describe("BackerNotificationPreferencePanel", () => {
  it("renders the notification preference panel with campaigns and event toggles", () => {
    render(<BackerNotificationPreferencePanel />);

    expect(screen.getByText("Backer Notification Preferences")).toBeDefined();
    expect(screen.getByText("Campaign Updates")).toBeDefined();
    expect(screen.getByText("Milestones")).toBeDefined();
    expect(screen.getByText("End of Campaign")).toBeDefined();
    expect(screen.getByText("Reward Shipped")).toBeDefined();
  });

  it("allows switching between backed campaigns", () => {
    render(<BackerNotificationPreferencePanel />);

    const oceanButton = screen.getByText("Mangrove Estuary Coastal Defense");
    expect(oceanButton).toBeDefined();
    fireEvent.click(oceanButton);
  });

  it("toggles channel options when clicked", () => {
    render(<BackerNotificationPreferencePanel />);

    const pushToggle = screen.getByLabelText("Toggle Push for Campaign Updates");
    expect(pushToggle).toBeDefined();
    const initialPressed = pushToggle.getAttribute("aria-pressed");

    fireEvent.click(pushToggle);
    expect(pushToggle.getAttribute("aria-pressed")).not.toBe(initialPressed);
  });

  it("opens bulk management modal and allows configuring bulk updates", async () => {
    render(<BackerNotificationPreferencePanel />);

    const bulkButton = screen.getByRole("button", { name: /Bulk Manage All/i });
    fireEvent.click(bulkButton);

    expect(screen.getByText("Bulk Notification Management")).toBeDefined();
    expect(screen.getByText("Apply to All Campaigns")).toBeDefined();
  });
});
