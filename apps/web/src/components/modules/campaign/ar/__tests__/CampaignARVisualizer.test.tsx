import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignARVisualizer } from "../CampaignARVisualizer";

beforeEach(() => {
  vi.restoreAllMocks();
  if (typeof window !== "undefined") {
    // @ts-expect-error mock mediaDevices
    navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    };
  }
});

describe("CampaignARVisualizer component", () => {
  const defaultProps = {
    campaignId: "camp-101",
    campaignTitle: "Save the Amazon RainForest Reserve",
    treeType: "Oak",
    treesPlanted: 1500,
    location: "Amazon Basin, Brazil",
    onClose: vi.fn(),
  };

  it("renders the AR visualizer container and campaign headers", () => {
    render(<CampaignARVisualizer {...defaultProps} />);

    expect(screen.getByTestId("campaign-ar-visualizer")).toBeTruthy();
    expect(screen.getByText("Save the Amazon RainForest Reserve")).toBeTruthy();
    expect(screen.getByText("White Oak")).toBeTruthy();
  });

  it("renders the virtual tree model and ground placement reticle", () => {
    render(<CampaignARVisualizer {...defaultProps} />);

    expect(screen.getByTestId("ar-virtual-tree-model")).toBeTruthy();
    expect(screen.getByTestId("ar-ground-reticle")).toBeTruthy();
  });

  it("switches growth timelines between Day 1, 5 Years, 10 Years, and 20 Years", () => {
    render(<CampaignARVisualizer {...defaultProps} />);

    // Default timeline is 10 Years
    expect(screen.getAllByText(/10 Years/i).length).toBeGreaterThan(0);

    // Click 5 Years timeline button
    const fiveYearButton = screen.getByRole("button", { name: /5 Years/i });
    fireEvent.click(fiveYearButton);
    expect(screen.getAllByText("Young Juvenile Tree").length).toBeGreaterThan(0);

    // Click 20 Years timeline button
    const twentyYearButton = screen.getByRole("button", { name: /20 Years/i });
    fireEvent.click(twentyYearButton);
    expect(screen.getAllByText("Mature Climax Forest Pillar").length).toBeGreaterThan(0);

    // Click Day 1 baseline button
    const day1Button = screen.getByRole("button", { name: /Day 1/i });
    fireEvent.click(day1Button);
    expect(screen.getAllByText("Nursery Sapling").length).toBeGreaterThan(0);
  });

  it("allows switching between live AR and 3D Studio mode", () => {
    render(<CampaignARVisualizer {...defaultProps} />);

    const studioToggle = screen.getByTitle(/Switch to 3D Simulator/i);
    fireEvent.click(studioToggle);

    // Studio backdrop should now be present
    expect(screen.getByTestId("ar-studio-backdrop")).toBeTruthy();
  });

  it("triggers onClose when exit button is clicked", () => {
    const handleClose = vi.fn();
    render(<CampaignARVisualizer {...defaultProps} onClose={handleClose} />);

    const exitBtn = screen.getByLabelText("Exit AR visualizer");
    fireEvent.click(exitBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
