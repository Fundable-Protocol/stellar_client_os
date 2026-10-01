import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CampaignMilestones } from "./CampaignMilestones";

// framer-motion: render children directly so animations don't break in jsdom.
// We strip framer-only props (initial/animate/transition/while* etc.) so they
// are not forwarded to the DOM as invalid attributes.
type MotionProps = Partial<Record<string, unknown>> & Record<string, unknown>;
const MOTION_ONLY_KEYS = new Set([
  "initial",
  "animate",
  "transition",
  "whileHover",
  "whileTap",
  "whileInView",
  "exit",
  "layout",
]);
const stripMotionProps = (props: MotionProps): Record<string, unknown> =>
  Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_ONLY_KEYS.has(k)));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: MotionProps & { children?: React.ReactNode }) => (
      <div {...stripMotionProps(props)}>{children}</div>
    ),
    span: ({ children, ...props }: MotionProps & { children?: React.ReactNode }) => (
      <span {...stripMotionProps(props)}>{children}</span>
    ),
  },
}));

const renderMilestones = (
  raised: string | number | undefined,
  goal: string | number | undefined
) =>
  render(
    <CampaignMilestones raisedAmount={raised} goalAmount={goal} />
  );

describe("CampaignMilestones", () => {
  it("renders all four milestone badges", () => {
    renderMilestones("33,850", "50,000");
    expect(screen.getByTestId("milestone-25")).toBeTruthy();
    expect(screen.getByTestId("milestone-50")).toBeTruthy();
    expect(screen.getByTestId("milestone-75")).toBeTruthy();
    expect(screen.getByTestId("milestone-100")).toBeTruthy();
  });

  it("unlocks the 25% and 50% badges when 67.7% funded", () => {
    renderMilestones("33,850", "50,000");
    expect(screen.getByTestId("milestone-25").getAttribute("data-achieved")).toBe("true");
    expect(screen.getByTestId("milestone-50").getAttribute("data-achieved")).toBe("true");
    expect(screen.getByTestId("milestone-75").getAttribute("data-achieved")).toBe("false");
    expect(screen.getByTestId("milestone-100").getAttribute("data-achieved")).toBe("false");
  });

  it("unlocks all badges and reports success at 100% funding", () => {
    renderMilestones("50,000", "50,000");
    expect(screen.getByTestId("milestone-25").getAttribute("data-achieved")).toBe("true");
    expect(screen.getByTestId("milestone-50").getAttribute("data-achieved")).toBe("true");
    expect(screen.getByTestId("milestone-75").getAttribute("data-achieved")).toBe("true");
    expect(screen.getByTestId("milestone-100").getAttribute("data-achieved")).toBe("true");
    expect(screen.getByText("Goal achieved")).toBeTruthy();
  });

  it("locks every badge and announces the next milestone when unfunded", () => {
    renderMilestones(0, "50,000");
    expect(screen.getByTestId("milestone-25").getAttribute("data-achieved")).toBe("false");
    expect(screen.getByTestId("milestone-100").getAttribute("data-achieved")).toBe("false");
    expect(screen.getByText("Next at 25%")).toBeTruthy();
  });

  it("labels each badge as achieved or locked for screen readers", () => {
    renderMilestones("33,850", "50,000");
    expect(
      screen.getByLabelText("25% milestone — Kickoff, achieved")
    ).toBeTruthy();
    expect(
      screen.getByLabelText("75% milestone — Almost There, locked")
    ).toBeTruthy();
  });
});
