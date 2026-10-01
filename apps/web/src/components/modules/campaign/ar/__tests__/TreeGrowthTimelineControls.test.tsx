import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TreeGrowthTimelineControls } from "../TreeGrowthTimelineControls";
import { calculateTreeGrowthMetrics } from "@/lib/tree-growth";

describe("TreeGrowthTimelineControls (Issue #878)", () => {
  const metrics = calculateTreeGrowthMetrics("Oak", "10y");

  const defaultProps = {
    currentTimeline: "10y" as const,
    metrics,
    scaleMultiplier: 1.0,
    showReticle: true,
    onTimelineChange: vi.fn(),
    onScaleChange: vi.fn(),
    onToggleReticle: vi.fn(),
  };

  it("renders timeline control HUD and metrics", () => {
    render(<TreeGrowthTimelineControls {...defaultProps} />);

    expect(screen.getByTestId("ar-timeline-controls")).toBeDefined();
    expect(screen.getByText("ESTIMATED HEIGHT")).toBeDefined();
    expect(screen.getByText("CUMULATIVE CO2")).toBeDefined();
    expect(screen.getByText("CANOPY SPREAD")).toBeDefined();
  });

  it("renders 5, 10, and 20 year timeline buttons", () => {
    render(<TreeGrowthTimelineControls {...defaultProps} />);

    expect(screen.getByRole("button", { name: /5 Years/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /10 Years/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /20 Years/i })).toBeDefined();
  });

  it("triggers onTimelineChange when clicking timeline buttons", () => {
    const onTimelineChange = vi.fn();
    render(<TreeGrowthTimelineControls {...defaultProps} onTimelineChange={onTimelineChange} />);

    const twentyYrBtn = screen.getByRole("button", { name: /20 Years/i });
    fireEvent.click(twentyYrBtn);

    expect(onTimelineChange).toHaveBeenCalledWith("20y");
  });

  it("triggers scale changes when zoom in / out are clicked", () => {
    const onScaleChange = vi.fn();
    render(<TreeGrowthTimelineControls {...defaultProps} onScaleChange={onScaleChange} />);

    const zoomInBtn = screen.getByTitle("Scale up 3D model");
    fireEvent.click(zoomInBtn);

    expect(onScaleChange).toHaveBeenCalled();
  });

  it("toggles ground reticle guide", () => {
    const onToggleReticle = vi.fn();
    render(<TreeGrowthTimelineControls {...defaultProps} onToggleReticle={onToggleReticle} />);

    const reticleBtn = screen.getByTitle("Toggle AR alignment reticle");
    fireEvent.click(reticleBtn);

    expect(onToggleReticle).toHaveBeenCalled();
  });
});
