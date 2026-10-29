import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignCreatorVerificationBadge, CreatorVerificationBadge } from "./CreatorVerificationBadge";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CreatorVerificationBadge", () => {
  it("shows the Verified Creator badge when email, phone and government ID are verified", () => {
    render(<CreatorVerificationBadge verification={{ emailVerified: true, phoneVerified: true, governmentIdVerified: true }} />);
    const badge = screen.getByTestId("creator-verification-badge");
    expect(badge.textContent).toContain("Verified Creator");
    expect(badge.getAttribute("data-verification-status")).toBe("verified");
    expect(badge.getAttribute("aria-label")).toContain("email, phone and government ID verified");
  });

  it("shows a subdued progress chip for partially verified creators", () => {
    render(<CreatorVerificationBadge verification={{ emailVerified: true, phoneVerified: true }} />);
    const badge = screen.getByTestId("creator-verification-badge");
    expect(badge.textContent).toContain("2 of 3 identity checks");
    expect(badge.getAttribute("title")).toBe("Email and phone verified");
  });

  it("can hide partial status", () => {
    const { container } = render(<CreatorVerificationBadge verification={{ emailVerified: true }} showPartial={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing for unverified creators unless requested (verification is optional)", () => {
    const { container, rerender } = render(<CreatorVerificationBadge verification={null} />);
    expect(container.innerHTML).toBe("");
    rerender(<CreatorVerificationBadge verification={null} showUnverified />);
    expect(screen.getByTestId("creator-verification-badge").textContent).toContain("Not verified");
  });

  it("loads the creator status from the public API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ verification: { summary: { emailVerified: true, phoneVerified: true, governmentIdVerified: true } } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      render(<CampaignCreatorVerificationBadge creator="GABC" />);
    });
    await waitFor(() => expect(screen.getByTestId("creator-verification-badge").textContent).toContain("Verified Creator"));
    expect(fetchMock).toHaveBeenCalledWith("/api/creators/GABC/verification");
  });

  it("fails quietly when the status cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    let container!: HTMLElement;
    await act(async () => {
      container = render(<CampaignCreatorVerificationBadge creator="GABC" />).container;
    });
    expect(container.innerHTML).toBe("");
  });
});
