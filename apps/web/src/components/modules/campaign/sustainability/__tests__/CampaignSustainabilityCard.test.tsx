import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CampaignSustainabilityCard } from "../CampaignSustainabilityCard";
import { SustainabilityScoreBadge } from "../SustainabilityScoreBadge";

describe("Sustainability Score Components", () => {
  describe("SustainabilityScoreBadge", () => {
    it("renders score and tier badge cleanly", () => {
      render(<SustainabilityScoreBadge score={92} tier="Optimal" />);

      expect(screen.getByTestId("sustainability-score-badge")).toBeTruthy();
      expect(screen.getByText("92")).toBeTruthy();
      expect(screen.getByText("Optimal")).toBeTruthy();
    });

    it("supports click interactions when onClick is provided", () => {
      let clicked = false;
      render(
        <SustainabilityScoreBadge
          score={85}
          tier="High Impact"
          onClick={() => {
            clicked = true;
          }}
        />
      );

      fireEvent.click(screen.getByTestId("sustainability-score-badge"));
      expect(clicked).toBe(true);
    });
  });

  describe("CampaignSustainabilityCard", () => {
    const defaultProps = {
      campaignId: "camp-101",
      treeType: "Oak",
      speciesList: ["Oak", "Mangrove", "Cedar", "Fruit Tree"],
      treesPlanted: 1500,
      location: "Amazon Basin, Brazil",
      description: "Protecting 50,000 hectares of primary rainforest through community guardianship.",
    };

    it("renders sustainability score card, radial gauge, and category bars", () => {
      render(<CampaignSustainabilityCard {...defaultProps} />);

      expect(screen.getByTestId("campaign-sustainability-card")).toBeTruthy();
      expect(screen.getByTestId("sustainability-score-gauge")).toBeTruthy();

      expect(screen.getByTestId("pillar-row-speciesDiversity")).toBeTruthy();
      expect(screen.getByTestId("pillar-row-climateImpact")).toBeTruthy();
      expect(screen.getByTestId("pillar-row-soilHealth")).toBeTruthy();
      expect(screen.getByTestId("pillar-row-biodiversityPotential")).toBeTruthy();
    });

    it("displays the calculated score and tier", () => {
      render(<CampaignSustainabilityCard {...defaultProps} />);

      expect(screen.getByText("Ecosystem Impact Rating")).toBeTruthy();
      expect(screen.getAllByText("Optimal").length).toBeGreaterThan(0);
    });

    it("toggles transparency breakdown section on demand", () => {
      render(<CampaignSustainabilityCard {...defaultProps} />);

      // Initially closed
      expect(screen.queryByTestId("transparency-breakdown")).toBeNull();

      // Click toggle
      const toggleBtn = screen.getByRole("button", {
        name: /why this score\? view transparent breakdown/i,
      });
      fireEvent.click(toggleBtn);

      // Should now be open
      const breakdown = screen.getByTestId("transparency-breakdown");
      expect(breakdown).toBeTruthy();
      expect(within(breakdown).getByText(/Species Diversity/i)).toBeTruthy();
      expect(within(breakdown).getByText(/Regional Climate Impact/i)).toBeTruthy();

      // Click to hide
      const hideBtn = screen.getByRole("button", {
        name: /hide score breakdown & rationale/i,
      });
      fireEvent.click(hideBtn);

      // Should be closed again
      expect(screen.queryByTestId("transparency-breakdown")).toBeNull();
    });

    it("renders creator actionable recommendations to improve rating", () => {
      render(
        <CampaignSustainabilityCard
          treeType="Pine"
          location="Temperate Forest"
          treesPlanted={200}
        />
      );

      expect(
        screen.getByText(/Ecological Recommendations to Boost Score/i)
      ).toBeTruthy();
    });
  });
});
