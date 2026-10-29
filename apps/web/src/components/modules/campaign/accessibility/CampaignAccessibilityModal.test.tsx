import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignAccessibilityModal } from "./CampaignAccessibilityModal";
import type { AccessibilityAuditResult } from "@/services/campaign-accessibility.service";

const MOCK_CRITICAL_AUDIT: AccessibilityAuditResult = {
  passed: false,
  canPublish: false,
  score: 60,
  criticalIssues: [
    {
      id: "img-alt-missing",
      wcagCriterion: "WCAG 2.1 AA — 1.1.1 Non-text Content",
      ruleId: "image-alt-missing",
      severity: "critical",
      title: "Missing Alternative Text for Campaign Cover Image",
      description: "A cover image URL is provided, but no alternative text is specified for screen reader users.",
      suggestion: "Add a concise, descriptive Cover Image Alt Text describing what the image shows.",
      field: "imageAlt",
    },
  ],
  warnings: [
    {
      id: "title-all-caps",
      wcagCriterion: "WCAG 2.1 AA — 2.4.6 Headings and Labels",
      ruleId: "title-all-caps",
      severity: "warning",
      title: "All-Caps Heading Text",
      description: "Headings in all uppercase letters can impede reading speed.",
      suggestion: "Format your campaign title using mixed title or sentence case.",
      field: "title",
    },
  ],
  allIssues: [
    {
      id: "img-alt-missing",
      wcagCriterion: "WCAG 2.1 AA — 1.1.1 Non-text Content",
      ruleId: "image-alt-missing",
      severity: "critical",
      title: "Missing Alternative Text for Campaign Cover Image",
      description: "A cover image URL is provided, but no alternative text is specified for screen reader users.",
      suggestion: "Add a concise, descriptive Cover Image Alt Text describing what the image shows.",
      field: "imageAlt",
    },
    {
      id: "title-all-caps",
      wcagCriterion: "WCAG 2.1 AA — 2.4.6 Headings and Labels",
      ruleId: "title-all-caps",
      severity: "warning",
      title: "All-Caps Heading Text",
      description: "Headings in all uppercase letters can impede reading speed.",
      suggestion: "Format your campaign title using mixed title or sentence case.",
      field: "title",
    },
  ],
  summary: {
    total: 2,
    criticalCount: 1,
    warningCount: 1,
    passedRuleCount: 8,
  },
  timestamp: Date.now(),
};

const MOCK_WARNING_ONLY_AUDIT: AccessibilityAuditResult = {
  passed: false,
  canPublish: true,
  score: 95,
  criticalIssues: [],
  warnings: [
    {
      id: "link-purpose-ambiguous",
      wcagCriterion: "WCAG 2.1 AA — 2.4.4 Link Purpose (In Context)",
      ruleId: "link-purpose",
      severity: "warning",
      title: "Ambiguous Link Text Detected",
      description: "Vague link phrases like 'click here' lack context.",
      suggestion: "Replace generic text with destination-specific link labels.",
      field: "fullStory",
    },
  ],
  allIssues: [
    {
      id: "link-purpose-ambiguous",
      wcagCriterion: "WCAG 2.1 AA — 2.4.4 Link Purpose (In Context)",
      ruleId: "link-purpose",
      severity: "warning",
      title: "Ambiguous Link Text Detected",
      description: "Vague link phrases like 'click here' lack context.",
      suggestion: "Replace generic text with destination-specific link labels.",
      field: "fullStory",
    },
  ],
  summary: {
    total: 1,
    criticalCount: 0,
    warningCount: 1,
    passedRuleCount: 9,
  },
  timestamp: Date.now(),
};

describe("CampaignAccessibilityModal", () => {
  it("renders modal dialog with accessible attributes when open", () => {
    render(
      <CampaignAccessibilityModal
        isOpen={true}
        onClose={vi.fn()}
        auditResult={MOCK_CRITICAL_AUDIT}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: /WCAG 2.1 AA Accessibility Audit/i })).toBeTruthy();
  });

  it("lists issues with clear fix suggestions", () => {
    render(
      <CampaignAccessibilityModal
        isOpen={true}
        onClose={vi.fn()}
        auditResult={MOCK_CRITICAL_AUDIT}
      />
    );

    expect(screen.getByText("Missing Alternative Text for Campaign Cover Image")).toBeTruthy();
    expect(screen.getByText(/Add a concise, descriptive Cover Image Alt Text/i)).toBeTruthy();
    expect(screen.getByText("All-Caps Heading Text")).toBeTruthy();
    expect(screen.getByText(/Format your campaign title using mixed title/i)).toBeTruthy();
  });

  it("indicates publishing is blocked when critical issues exist", () => {
    render(
      <CampaignAccessibilityModal
        isOpen={true}
        onClose={vi.fn()}
        auditResult={MOCK_CRITICAL_AUDIT}
      />
    );

    expect(screen.getByText(/Publishing Blocked — Critical Issues Found/i)).toBeTruthy();
    expect(screen.getByText(/must be resolved before this campaign page can be published/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Proceed with Publish/i })).toBeNull();
  });

  it("indicates warnings are advisory and enables Proceed with Publish button", () => {
    const handleProceed = vi.fn();
    render(
      <CampaignAccessibilityModal
        isOpen={true}
        onClose={vi.fn()}
        auditResult={MOCK_WARNING_ONLY_AUDIT}
        onProceedPublish={handleProceed}
      />
    );

    expect(screen.getByText(/Publishing Allowed — Warnings are Advisory/i)).toBeTruthy();
    const proceedBtn = screen.getByRole("button", { name: /Proceed with Publish/i });
    expect(proceedBtn).toBeTruthy();

    fireEvent.click(proceedBtn);
    expect(handleProceed).toHaveBeenCalledTimes(1);
  });

  it("filters between All, Critical, and Warnings", () => {
    render(
      <CampaignAccessibilityModal
        isOpen={true}
        onClose={vi.fn()}
        auditResult={MOCK_CRITICAL_AUDIT}
      />
    );

    const criticalFilter = screen.getByRole("tab", { name: /Critical \(1\)/i });
    fireEvent.click(criticalFilter);

    expect(screen.getByText("Missing Alternative Text for Campaign Cover Image")).toBeTruthy();
    expect(screen.queryByText("All-Caps Heading Text")).toBeNull();

    const warningFilter = screen.getByRole("tab", { name: /Warnings \(1\)/i });
    fireEvent.click(warningFilter);

    expect(screen.queryByText("Missing Alternative Text for Campaign Cover Image")).toBeNull();
    expect(screen.getByText("All-Caps Heading Text")).toBeTruthy();
  });

  it("dismisses on Escape key press or close button", () => {
    const handleClose = vi.fn();
    render(
      <CampaignAccessibilityModal
        isOpen={true}
        onClose={handleClose}
        auditResult={MOCK_CRITICAL_AUDIT}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /Close accessibility audit dialog/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
