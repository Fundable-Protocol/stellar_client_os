import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignImpactWidgetModal } from "./CampaignImpactWidgetModal";

describe("CampaignImpactWidgetModal (Issue #883)", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    campaignId: "42",
    campaignTitle: "Amazon Reforestation Initiative",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <CampaignImpactWidgetModal {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal header, themes, live preview, and embed code", () => {
    render(<CampaignImpactWidgetModal {...defaultProps} />);

    expect(screen.getByText("Embed Campaign Widget")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Forest.*Green & Emerald/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Dark.*Slate & Neon/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Light.*Clean & Crisp/i })).toBeTruthy();
    expect(screen.getByText("Live Preview")).toBeTruthy();
    expect(screen.getByText("HTML iframe code")).toBeTruthy();
    expect(screen.getByText(/iframe src=/i)).toBeTruthy();
  });

  it("switches theme when theme buttons are clicked", () => {
    render(<CampaignImpactWidgetModal {...defaultProps} />);

    const darkBtn = screen.getByRole("button", { name: /Dark.*Slate & Neon/i });
    fireEvent.click(darkBtn);

    const codeSnippet = screen.getByText(/iframe src=/i);
    expect(codeSnippet.textContent).toContain("theme=dark");
  });

  it("lets creators copy the Web Component embed", () => {
    render(<CampaignImpactWidgetModal {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Web Component" }));
    expect(screen.getByText("Web Component code")).toBeTruthy();
    expect(screen.getByText(/fundable-widget campaign-id=/i)).toBeTruthy();
    expect(screen.getByText(/fundable-widget\.js/i)).toBeTruthy();
  });

  it("copies embed snippet to clipboard on copy click", async () => {
    render(<CampaignImpactWidgetModal {...defaultProps} />);

    const copyBtn = screen.getByText(/Copy Code/i);
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('<iframe src=')
    );
    await waitFor(() => expect(screen.getByText("✓ Copied!")).toBeTruthy());
  });

  it("calls onClose when close button or Done is clicked", () => {
    render(<CampaignImpactWidgetModal {...defaultProps} />);

    const closeBtn = screen.getByLabelText("Close modal");
    fireEvent.click(closeBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);

    const doneBtn = screen.getByText("Done");
    fireEvent.click(doneBtn);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
  });
});
