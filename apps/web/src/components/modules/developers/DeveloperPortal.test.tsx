import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeveloperPortal } from "./DeveloperPortal";

describe("DeveloperPortal", () => {
  it("renders API reference documentation, rate-limit quota display, and sandbox controls", () => {
    render(<DeveloperPortal />);

    expect(
      screen.getByText(/Fundable Developer Portal & Public Campaign API/i),
    ).toBeDefined();

    // Quota display
    expect(screen.getByTestId("hourly-quota-summary").textContent).toContain(
      "1000 req",
    );
    expect(screen.getByTestId("daily-quota-summary").textContent).toContain(
      "25000 req",
    );

    // Reference endpoints
    expect(screen.getByText("/api/v1/oauth/token")).toBeDefined();
    expect(screen.getByText("/api/v1/campaigns")).toBeDefined();
    expect(screen.getByText("/api/v1/campaigns/{id}/widget")).toBeDefined();
    expect(screen.getByText("/api/v1/webhooks")).toBeDefined();

    // Switch to Sandbox tab
    fireEvent.click(screen.getByRole("tab", { name: /OAuth2 & Sandbox Console/i }));
    expect(screen.getByText(/Generate OAuth2 Bearer Token/i)).toBeDefined();

    // Switch to Widgets tab
    fireEvent.click(screen.getByRole("tab", { name: /Embeddable Widgets/i }));
    expect(screen.getByTestId("widget-embed-snippet").textContent).toContain(
      "<iframe",
    );
  });
});
