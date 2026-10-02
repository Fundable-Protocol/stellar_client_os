import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OneTimeDonationButton } from "./OneTimeDonationButton";

vi.mock("./CampaignDonationPanel", () => ({
  CampaignDonationPanel: ({
    campaignId,
    campaignName,
  }: {
    campaignId: string;
    campaignName?: string;
  }) => (
    <div data-testid="donation-panel">
      {campaignId}|{campaignName}
    </div>
  ),
}));

function setup() {
  render(<OneTimeDonationButton campaignId="c-1" campaignName="Green Hills" />);
  return screen.getByRole("button", { name: /one-time donate/i });
}

describe("OneTimeDonationButton", () => {
  it("shows a 'One-time Donate' button and no dialog initially", () => {
    const trigger = setup();
    expect(trigger).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a dialog that renders the donation panel for the campaign", () => {
    const trigger = setup();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("donation-panel").textContent).toBe(
      "c-1|Green Hills",
    );
  });

  it("closes via the close button and restores focus to the trigger", () => {
    const trigger = setup();
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("button", { name: /close donation dialog/i }),
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape", () => {
    const trigger = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on backdrop click but not on clicks inside the dialog", () => {
    const trigger = setup();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("locks body scroll while open and releases it on close", () => {
    const trigger = setup();
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(document.activeElement).toBe(trigger);
  });
});