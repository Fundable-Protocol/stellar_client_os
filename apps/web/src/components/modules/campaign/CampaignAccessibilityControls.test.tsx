import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CampaignAccessibilityControls } from "./CampaignAccessibilityControls";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-campaign-high-contrast");
  window.localStorage.clear();
});

describe("CampaignAccessibilityControls", () => {
  it("toggles and persists high contrast mode", async () => {
    render(<CampaignAccessibilityControls />);
    const toggle = screen.getByRole("button", { name: "High contrast: Off" });

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.campaignHighContrast).toBe("true");
    expect(window.localStorage.getItem("campaign-high-contrast")).toBe("true");
  });

  it("restores the saved preference", async () => {
    window.localStorage.setItem("campaign-high-contrast", "true");
    render(<CampaignAccessibilityControls />);

    expect(await screen.findByRole("button", { name: "High contrast: On" })).toBeDefined();
    expect(document.documentElement.dataset.campaignHighContrast).toBe("true");
  });
});
