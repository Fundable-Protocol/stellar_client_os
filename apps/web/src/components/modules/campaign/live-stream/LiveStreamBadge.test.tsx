import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveStreamBadge } from "./LiveStreamBadge";

describe("LiveStreamBadge", () => {
  it("renders an accessible live indicator only for an explicit live status", () => {
    render(<LiveStreamBadge status="live" />);
    const badge = screen.getByTestId("live-stream-badge");
    expect(badge.getAttribute("aria-label")).toBe("Live now");
    expect(badge.textContent).toContain("Live");
  });

  it.each(["offline", "unknown"] as const)("renders nothing for status %s", (status) => {
    const { container } = render(<LiveStreamBadge status={status} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the status is missing or null", () => {
    const { container: missing } = render(<LiveStreamBadge />);
    expect(missing.firstChild).toBeNull();
    const { container: nulled } = render(<LiveStreamBadge status={null} />);
    expect(nulled.firstChild).toBeNull();
  });

  it("accepts a className override", () => {
    render(<LiveStreamBadge status="live" className="mt-2" />);
    expect(screen.getByTestId("live-stream-badge").className).toContain("mt-2");
  });
});
