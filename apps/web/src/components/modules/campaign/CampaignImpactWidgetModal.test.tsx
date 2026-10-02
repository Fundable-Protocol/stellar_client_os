import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CampaignImpactWidgetModal } from "./CampaignImpactWidgetModal";

describe("CampaignImpactWidgetModal (Issue #883)", () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    campaignId: "42",
    campaignTitle: "Amazon Reforestation Initiative",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
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

    expect(screen.getByText("Embed Campaign Widget")).toBeInTheDocument();
    expect(screen.getByText(/Forest/i)).toBeInTheDocument();
    expect(screen.getByText(/Dark/i)).toBeInTheDocument();
    expect(screen.getByText(/Light/i)).toBeInTheDocument();
    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getByText("HTML Embed Code")).toBeInTheDocument();
    expect(screen.getByText(/iframe src=/i)).toBeInTheDocument();
  });

  it("switches theme when theme buttons are clicked", () => {
    render(<CampaignImpactWidgetModal {...defaultProps} />);

    const darkBtn = screen.getByText(/Dark/i);
    fireEvent.click(darkBtn);

    const codeSnippet = screen.getByText(/iframe src=/i);
    expect(codeSnippet.textContent).toContain("theme=dark");
  });

  it("copies embed snippet to clipboard on copy click", async () => {
    render(<CampaignImpactWidgetModal {...defaultProps} />);

    const copyBtn = screen.getByText(/Copy Code/i);
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('<iframe src=')
    );
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
