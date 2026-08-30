import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImpactMapSection, filterTreesByStatus, TREE_STATUS_OPTIONS } from "./ImpactMapSection";

describe("ImpactMapSection tree status filter", () => {
  it("exposes the required tree status options", () => {
    expect(TREE_STATUS_OPTIONS.map((option) => option.label)).toEqual([
      "All",
      "Pending",
      "Planted",
      "Verified",
      "Failed",
    ]);
  });

  it("filters projects by the selected tree status", () => {
    const projects = [
      { id: "1", name: "Amazon Grove", status: "pending" },
      { id: "2", name: "Forest Loop", status: "planted" },
      { id: "3", name: "Mangrove Restore", status: "verified" },
      { id: "4", name: "Desert Claim", status: "failed" },
    ];

    expect(filterTreesByStatus(projects, "all")).toHaveLength(4);
    expect(filterTreesByStatus(projects, "verified")).toEqual([projects[2]]);
    expect(filterTreesByStatus(projects, "failed")).toEqual([projects[3]]);
  });

  it("renders the sponsor dashboard filter dropdown", () => {
    render(<ImpactMapSection />);

    expect(screen.getByText("Impact Projects")).toBeDefined();
    expect(screen.getByText("All")).toBeDefined();
  });

  it("updates the project list when a different tree status is selected", () => {
    render(<ImpactMapSection />);

    fireEvent.click(screen.getByText("All"));
    fireEvent.click(screen.getByText("Verified"));

    expect(screen.getByText("Verified Projects")).toBeDefined();
  });
});
