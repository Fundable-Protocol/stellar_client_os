import React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HighContrastProvider } from "@/providers/HighContrastProvider";
import { HighContrastToggle } from "./high-contrast-toggle";

describe("HighContrastToggle & HighContrastProvider — WCAG 2.1 AA Compliance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("high-contrast");
    document.documentElement.removeAttribute("data-campaign-high-contrast");
    document.documentElement.removeAttribute("data-high-contrast");
  });

  it("renders with accessible role, switch state, and clear label", () => {
    render(
      <HighContrastProvider>
        <HighContrastToggle />
      </HighContrastProvider>
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toContain("Toggle high-contrast color mode");
    expect(screen.getByText(/Contrast:/i)).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("toggles high contrast mode on click and updates document classes and storage", () => {
    render(
      <HighContrastProvider>
        <HighContrastToggle />
      </HighContrastProvider>
    );

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.classList.contains("high-contrast")).toBe(true);
    expect(document.documentElement.dataset.campaignHighContrast).toBe("true");
    expect(document.documentElement.dataset.highContrast).toBe("true");
    expect(window.localStorage.getItem("fundable-high-contrast")).toBe("true");
    expect(screen.getByText(/On \(4\.5:1\+\)/i)).toBeTruthy();

    // Toggle off
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(document.documentElement.classList.contains("high-contrast")).toBe(false);
    expect(document.documentElement.dataset.campaignHighContrast).toBe("false");
    expect(window.localStorage.getItem("fundable-high-contrast")).toBe("false");
  });

  it("supports keyboard controls via Enter and Space keydown", () => {
    render(
      <HighContrastProvider>
        <HighContrastToggle />
      </HighContrastProvider>
    );

    const toggle = screen.getByRole("switch");
    fireEvent.keyDown(toggle, { key: "Enter", code: "Enter" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.keyDown(toggle, { key: " ", code: "Space" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("restores previously stored high contrast preference on mount", () => {
    window.localStorage.setItem("fundable-high-contrast", "true");

    render(
      <HighContrastProvider>
        <HighContrastToggle />
      </HighContrastProvider>
    );

    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.classList.contains("high-contrast")).toBe(true);
  });
});
