import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CampaignWizard } from "./CampaignWizard";
import type { CampaignWizardData } from "./campaign-wizard-config";

const BASE_VALID_DATA: Partial<CampaignWizardData> = {
  title: "Save the Amazon RainForest Reserve",
  category: "environmental",
  shortDescription: "Planting native hardwood species in deforested corridors.",
  fullStory: "Our team collaborates with local arborists to plant resilient native hardwood species across degraded land.",
  risksAndChallenges: "Seasonal flooding may delay planting; local partners will maintain a flexible schedule and identify backup sites.",
  imageUrl: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09",
  imageAlt: "Aerial view of rainforest canopy and winding river",
  goalAmount: "25000",
  token: "XLM",
  targetBackers: "150",
  minContribution: "10",
  startDate: "2026-11-01",
  endDate: "2026-12-01",
  milestones: [
    {
      id: "m-1",
      title: "Greenhouse setup",
      targetDate: "2026-11-10",
      description: "Establish initial saplings.",
    },
  ],
  stretchGoals: [],
  impactStatement: "Restore 200 hectares of biodiverse reserve.",
  targetBeneficiaries: "500",
  co2OffsetTons: "300",
  socialMetrics: "10 rangers hired",
  isDraft: false,
  language: "en",
  translations: {},
  autoTranslate: false,
};

const goToPreview = () => {
  for (let i = 0; i < 4; i++) {
    const continueBtn = screen.getByRole("button", { name: /continue to/i });
    fireEvent.click(continueBtn);
  }
};

describe("CampaignWizard Accessibility Checker Workflow", () => {
  it("runs accessibility check via Check Accessibility button on preview step and shows results", async () => {
    render(<CampaignWizard initialData={BASE_VALID_DATA} />);

    // Step forward to preview
    goToPreview();

    // Locate Check Accessibility button
    const checkBtns = screen.getAllByRole("button", { name: /check accessibility/i });
    expect(checkBtns.length).toBeGreaterThan(0);

    // Click Check Accessibility button
    fireEvent.click(checkBtns[0]);

    // Modal dialog opens
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /WCAG 2.1 AA Accessibility Audit/i })).toBeTruthy();
    expect(screen.getAllByText(/All WCAG 2.1 AA Checks Passed/i).length).toBeGreaterThan(0);
  });

  it("automatically runs on publish and blocks publishing if critical accessibility issues exist", async () => {
    const handleComplete = vi.fn();
    // Missing imageAlt when imageUrl is set
    const dataWithMissingAlt: Partial<CampaignWizardData> = {
      ...BASE_VALID_DATA,
      imageAlt: "",
    };

    render(<CampaignWizard initialData={dataWithMissingAlt} onComplete={handleComplete} />);

    // Step forward to preview
    goToPreview();

    // Click Launch Campaign (Publish)
    const launchBtn = screen.getByRole("button", { name: /launch campaign/i });
    fireEvent.click(launchBtn);

    // Publishing should be blocked!
    expect(handleComplete).not.toHaveBeenCalled();

    // Modal dialog should automatically appear with critical issue and fix suggestion
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Publishing Blocked — Critical Issues Found/i)).toBeTruthy();
    expect(screen.getByText(/Missing Alternative Text for Campaign Cover Image/i)).toBeTruthy();
    expect(screen.getByText(/Add a concise, descriptive Cover Image Alt Text/i)).toBeTruthy();
  });

  it("automatically runs on publish and permits publishing when only advisory warnings exist", async () => {
    const handleComplete = vi.fn();
    // Warning: ALL CAPS title (advisory)
    const dataWithWarning: Partial<CampaignWizardData> = {
      ...BASE_VALID_DATA,
      title: "SAVE THE AMAZON RAINFOREST RESERVE",
    };

    render(<CampaignWizard initialData={dataWithWarning} onComplete={handleComplete} />);

    // Step forward to preview
    goToPreview();

    // Click Launch Campaign (Publish)
    const launchBtn = screen.getByRole("button", { name: /launch campaign/i });
    fireEvent.click(launchBtn);

    // Because warnings are advisory, publish completes successfully!
    await waitFor(() => {
      expect(handleComplete).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/Campaign Created Successfully!/i)).toBeTruthy();
  });
});
