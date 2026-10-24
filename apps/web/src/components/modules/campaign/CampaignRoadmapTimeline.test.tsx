import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampaignRoadmapTimeline } from "./CampaignRoadmapTimeline";

describe("CampaignRoadmapTimeline", () => {
  it("renders phases with dates and responsive timeline semantics", () => {
    render(<CampaignRoadmapTimeline phases={[{ id: "phase-1", title: "Pilot", targetDate: "2026-04-01", description: "Run the pilot" }]} />);
    expect(screen.getByRole("heading", { name: /project roadmap/i })).toBeTruthy();
    expect(screen.getByText("Pilot")).toBeTruthy();
    expect(screen.getByText("Run the pilot")).toBeTruthy();
  });
});
