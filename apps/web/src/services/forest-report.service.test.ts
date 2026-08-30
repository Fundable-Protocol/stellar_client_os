import { describe, expect, it } from "vitest";
import {
  buildForestReportPdf,
  forestReportLimits,
  validateForestReportInput,
  type ForestReportInput,
} from "./forest-report.service";

const report: ForestReportInput = {
  sponsorName: "Ada Sponsor",
  sponsorAddress: "GABCD1234567890ABCDEFGHJKLMNPQRSTUVWXYZABCDEFGHJKLMNPQRSTUV",
  trees: [
    {
      id: "tree-001",
      species: "Mangrove",
      plantedAt: "2026-02-01T00:00:00.000Z",
      location: "Lagos, Nigeria",
      annualCarbonKg: 12.5,
    },
    {
      id: "tree-002",
      species: "Teak",
      plantedAt: "2026-03-01T00:00:00.000Z",
      location: "Accra, Ghana",
      annualCarbonKg: 8.25,
    },
  ],
};

describe("forest report service", () => {
  it("rejects empty reports", () => {
    expect(() => validateForestReportInput({ trees: [] })).toThrow(
      "At least one sponsored tree is required"
    );
  });

  it("rejects non-HTTPS photo URLs", () => {
    expect(() =>
      validateForestReportInput({
        trees: [{ ...report.trees[0], photoUrl: "http://example.com/tree.jpg" }],
      })
    ).toThrow("photoUrl must be an HTTPS URL");
  });

  it("builds a PDF with the report metadata and tree summary", async () => {
    const bytes = await buildForestReportPdf(report, new Date("2026-08-26T00:00:00.000Z"));
    const header = new TextDecoder().decode(bytes.slice(0, 8));

    expect(header).toBe("%PDF-1.7");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("exposes conservative report limits", () => {
    expect(forestReportLimits.maxTrees).toBe(500);
    expect(forestReportLimits.maxPhotoBytes).toBe(2 * 1024 * 1024);
  });
});
