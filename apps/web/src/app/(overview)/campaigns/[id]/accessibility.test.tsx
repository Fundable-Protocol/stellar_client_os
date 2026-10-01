import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Mock React 19's use() hook for Promise parameters in route testing
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    use: (value: unknown) =>
      value instanceof Promise ? { id: "camp-101" } : (actual as { use: (v: unknown) => unknown }).use(value),
  };
});

// ResizeObserver stub for recharts layout in jsdom
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

import CampaignDetailPage from "./page";
import { CampaignDetail } from "@/components/modules/campaigns/CampaignDetail";
import { DEMO_CAMPAIGN_ID } from "@/services/campaign-backers.service";

const renderPage = () =>
  render(<CampaignDetailPage params={Promise.resolve({ id: DEMO_CAMPAIGN_ID })} />);

describe("Campaign Detail Page — WCAG 2.1 AA Accessibility Audit", () => {
  describe("Semantic Landmarks and Headings Structure", () => {
    it("contains a semantic <main> landmark with an accessible label", () => {
      renderPage();
      const main = screen.getByRole("main");
      expect(main).toBeTruthy();
      expect(main.getAttribute("aria-label")).toBe("Campaign details");
    });

    it("has a descriptive H1 heading for the campaign title", () => {
      renderPage();
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toBeTruthy();
      expect(h1.textContent).toContain("Save the Amazon RainForest Reserve");
    });

    it("maintains a logical heading structure for sub-sections", () => {
      renderPage();
      const h3Headings = screen.getAllByRole("heading", { level: 3 });
      expect(h3Headings.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole("heading", { name: /full campaign story/i })).toBeTruthy();
      expect(screen.getByRole("heading", { name: /impact statement/i })).toBeTruthy();
    });
  });

  describe("Progress Bars and Screen Reader Feedback", () => {
    it("provides an accessible progressbar with complete ARIA value properties", () => {
      renderPage();
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeTruthy();
      expect(progressbar.getAttribute("aria-valuenow")).toBe("68");
      expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
      expect(progressbar.getAttribute("aria-valuemax")).toBe("100");
      expect(progressbar.getAttribute("aria-label")).toBe("Campaign funding progress");
      expect(progressbar.getAttribute("aria-valuetext")).toContain("68% funded");
      expect(progressbar.getAttribute("aria-valuetext")).toContain("33,850 of 50,000 XLM");
    });

    it("AnimatedProgressBar module component satisfies WCAG progressbar requirements", () => {
      render(<CampaignDetail campaignId="1" />);
      const progressbar = screen.getByRole("progressbar");
      expect(progressbar).toBeTruthy();
      expect(progressbar.getAttribute("aria-valuenow")).toBe("73");
      expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
      expect(progressbar.getAttribute("aria-valuemax")).toBe("100");
      expect(progressbar.getAttribute("aria-label")).toBe("Campaign funding progress");
      expect(progressbar.getAttribute("aria-valuetext")).toContain("73% funded");
    });
  });

  describe("Form Labels, Controls, and Required Fields", () => {
    it("provides an accessible label for the language translation select dropdown", () => {
      renderPage();
      const select = screen.getByRole("combobox", { name: /translate campaign description/i });
      expect(select).toBeTruthy();
      expect(select.getAttribute("aria-label")).toBe("Translate campaign description");
    });

    it("has accessible form labels and aria-required attribute on insurance claim form", () => {
      renderPage();
      const openModalBtn = screen.getByRole("button", { name: /submit insurance claim/i });
      fireEvent.click(openModalBtn);

      const textarea = screen.getByLabelText(/evidence of campaign failure/i);
      expect(textarea).toBeTruthy();
      expect(textarea.getAttribute("aria-required")).toBe("true");
      expect(textarea.hasAttribute("required")).toBe(true);
      expect(textarea.getAttribute("id")).toBe("evidence");
    });
  });

  describe("Dialog, Focus Management, and Keyboard Dismissal", () => {
    it("renders insurance claim modal with dialog role, aria-modal, and labeledby title", () => {
      renderPage();
      const openModalBtn = screen.getByRole("button", { name: /submit insurance claim/i });
      fireEvent.click(openModalBtn);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute("aria-modal")).toBe("true");
      expect(dialog.getAttribute("aria-labelledby")).toBe("insurance-modal-title");
      expect(screen.getByRole("heading", { name: /submit insurance claim/i })).toBeTruthy();
    });

    it("provides an accessible close button with aria-label for the modal dialog", () => {
      renderPage();
      const openModalBtn = screen.getByRole("button", { name: /submit insurance claim/i });
      fireEvent.click(openModalBtn);

      const closeBtn = screen.getByRole("button", { name: /close insurance claim modal/i });
      expect(closeBtn).toBeTruthy();
      expect(closeBtn.getAttribute("aria-label")).toBe("Close insurance claim modal");

      fireEvent.click(closeBtn);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("dismisses the modal dialog when pressing the Escape keyboard key", () => {
      renderPage();
      const openModalBtn = screen.getByRole("button", { name: /submit insurance claim/i });
      fireEvent.click(openModalBtn);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();

      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("announces claim submission status via role=status and aria-live=polite", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /submit insurance claim/i }));

      const textarea = screen.getByLabelText(/evidence of campaign failure/i);
      fireEvent.change(textarea, { target: { value: "Project missed milestones." } });

      const submitBtn = screen.getByRole("button", { name: /submit claim/i });
      fireEvent.click(submitBtn);

      const status = screen.getByRole("status");
      expect(status).toBeTruthy();
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.textContent).toContain("Claim submitted successfully");
    });
  });

  describe("Tabs, Navigation, and Interactive Controls", () => {
    it("tablist has an accessible label and accessible tab buttons", () => {
      renderPage();
      const tablist = screen.getByRole("tablist", { name: /campaign navigation tabs/i });
      expect(tablist).toBeTruthy();

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(8);
      tabs.forEach((tab) => {
        expect(tab.textContent?.trim().length).toBeGreaterThan(0);
      });
    });

    it("all primary navigation links and action buttons have accessible names", () => {
      renderPage();
      expect(screen.getByRole("link", { name: /back to campaigns directory/i })).toBeTruthy();
      expect(screen.getByRole("link", { name: /donate/i })).toBeTruthy();
      expect(screen.getByRole("link", { name: /edit campaign/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /sponsor this campaign/i })).toBeTruthy();
    });
  });

  describe("Media and Images Accessibility", () => {
    it("all verification photos have descriptive alt text and video has controls", () => {
      const { container } = renderPage();
      const images = container.querySelectorAll("img");
      expect(images.length).toBeGreaterThan(0);
      images.forEach((img) => {
        const alt = img.getAttribute("alt");
        expect(alt).toBeTruthy();
        expect(alt?.trim().length).toBeGreaterThan(0);
      });

      const video = container.querySelector("video");
      expect(video).toBeTruthy();
      expect(video?.hasAttribute("controls")).toBe(true);
      expect(video?.getAttribute("aria-label")).toBeTruthy();
    });
  });

  describe("CampaignDetail Module Component Accessibility", () => {
    it("renders with accessible navigation, share button, and LiveTreeCounter region", () => {
      render(<CampaignDetail campaignId="1" />);

      expect(screen.getByRole("link", { name: /back to campaigns explorer/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /share campaign/i })).toBeTruthy();
      expect(screen.getByRole("region", { name: /live tree planting impact ticker/i })).toBeTruthy();
    });

    it("announces creator pause/resume action messages with live region", async () => {
      render(<CampaignDetail campaignId="1" />);

      const toggleButton = screen.getByRole("button", { name: /pause fundraising/i });
      expect(toggleButton).toBeTruthy();

      fireEvent.click(toggleButton);

      const alert = screen.getByRole("status");
      expect(alert).toBeTruthy();
      expect(alert.getAttribute("aria-live")).toBe("polite");
      expect(alert.textContent).toContain("PAUSED");
    });
  });
});
