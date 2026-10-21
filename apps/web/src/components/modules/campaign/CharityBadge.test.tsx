import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CharityBadge } from "./CharityBadge";

describe("CharityBadge", () => {
  it("renders nothing without a badge", () => {
    const { container } = render(<CharityBadge badge={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a label that links to the supporting documentation", () => {
    render(<CharityBadge badge={{ type: "CHARITY_VERIFIED", documentationUrl: "https://example.org/doc" }} />);
    const link = screen.getByTestId("charity-badge");
    expect(link).toHaveTextContent("Charity Verified");
    expect(link).toHaveAttribute("href", "https://example.org/doc");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("labels tax-exempt campaigns", () => {
    render(<CharityBadge badge={{ type: "TAX_EXEMPT", documentationUrl: "https://example.org/doc" }} />);
    expect(screen.getByTestId("charity-badge")).toHaveTextContent("Tax-Exempt");
  });
});
