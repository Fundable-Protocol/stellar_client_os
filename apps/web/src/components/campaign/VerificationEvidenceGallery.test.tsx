import { describe, expect, it } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { VerificationEvidenceGallery } from "./VerificationEvidenceGallery";
import type { VerificationEvidence } from "@/types/campaign-verification";

describe("VerificationEvidenceGallery Component (Issue #871)", () => {
  const mockEvidence: VerificationEvidence[] = [
    {
      id: "ev-1",
      campaignId: "c1",
      type: "photo",
      url: "https://ipfs.io/ipfs/QmTreePhoto1",
      caption: "Native sapling planted at Zone A",
      capturedAt: "2026-06-15T10:30:00Z",
      latitude: -3.4653,
      longitude: -62.2159,
      verifierId: "G_VERIFIER_ACC_1",
    },
    {
      id: "ev-2",
      campaignId: "c1",
      type: "video",
      url: "https://ipfs.io/ipfs/QmDroneVideo1",
      caption: "Drone canopy inspection sweep",
      capturedAt: "2026-06-16T14:00:00Z",
      latitude: -3.4700,
      longitude: -62.2200,
      verifierId: "G_VERIFIER_ACC_2",
    },
  ];

  it("returns null when evidence list is empty", () => {
    const { container } = render(<VerificationEvidenceGallery evidence={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders verification evidence heading and items", () => {
    render(<VerificationEvidenceGallery evidence={mockEvidence} />);

    expect(screen.getByText("Verification evidence")).toBeDefined();
    expect(screen.getByText("Native sapling planted at Zone A")).toBeDefined();
    expect(screen.getByText("Drone canopy inspection sweep")).toBeDefined();
  });

  it("displays timestamp, GPS coordinates, and verifier identity for transparency", () => {
    render(<VerificationEvidenceGallery evidence={mockEvidence} />);

    // Verifier IDs
    expect(screen.getByText("G_VERIFIER_ACC_1")).toBeDefined();
    expect(screen.getByText("G_VERIFIER_ACC_2")).toBeDefined();

    // GPS coordinates
    expect(screen.getByText("-3.46530, -62.21590")).toBeDefined();
    expect(screen.getByText("-3.47000, -62.22000")).toBeDefined();

    // Type badges
    expect(screen.getByText("photo")).toBeDefined();
    expect(screen.getByText("video")).toBeDefined();
  });
});
