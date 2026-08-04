import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StreamProgressVisualizer from "./StreamProgressVisualizer";
import { computeStreamProgress } from "@/hooks/use-stream-progress";

const START = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const END = START + 10 * HOUR;

const baseProps = {
  startTime: START,
  endTime: END,
  totalAmount: "100",
  withdrawnAmount: "10",
  tokenSymbol: "USDC",
  status: "active",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START + 5 * HOUR);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("computeStreamProgress", () => {
  it("returns an invalid result when the stream window or amount is unusable", () => {
    const progress = computeStreamProgress(
      { startTime: END, endTime: START, totalAmount: "100" },
      START
    );

    expect(progress.isValid).toBe(false);
    expect(progress.streamed).toBe(0);
  });

  it("clamps the streamed amount before the start and after the end", () => {
    const before = computeStreamProgress(baseProps, START - HOUR);
    const after = computeStreamProgress(baseProps, END + HOUR);

    expect(before.streamed).toBe(0);
    expect(after.streamed).toBe(100);
    expect(after.isComplete).toBe(true);
    expect(after.secondsRemaining).toBe(0);
  });

  it("derives the release rate from the total amount and duration", () => {
    const progress = computeStreamProgress(baseProps, START + 5 * HOUR);

    expect(progress.streamed).toBeCloseTo(50, 6);
    expect(progress.ratePerHour).toBeCloseTo(10, 6);
    expect(progress.available).toBeCloseTo(40, 6);
    expect(progress.remaining).toBeCloseTo(50, 6);
  });
});

describe("StreamProgressVisualizer", () => {
  it("renders a skeleton while loading", () => {
    render(<StreamProgressVisualizer {...baseProps} isLoading />);

    expect(screen.getByTestId("stream-visualizer-skeleton")).toBeDefined();
  });

  it("renders a fallback message when the stream data is unusable", () => {
    render(
      <StreamProgressVisualizer {...baseProps} totalAmount="0" endTime={START} />
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Stream progress is unavailable"
    );
  });

  it("shows the released balance, rate and progress for an active stream", () => {
    render(<StreamProgressVisualizer {...baseProps} />);

    expect(screen.getByText(/streaming live/i)).toBeDefined();
    expect(screen.getByTestId("streamed-amount").textContent).toContain("50.");
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuenow")
    ).toBe("50");
    expect(screen.getByText(/10 USDC\/hr/)).toBeDefined();
  });

  it("accumulates the streamed balance as time passes", () => {
    render(<StreamProgressVisualizer {...baseProps} />);

    const initial = screen.getByTestId("streamed-amount").textContent;

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const updated = screen.getByTestId("streamed-amount").textContent;
    expect(updated).not.toBe(initial);
    expect(parseFloat(updated!.replace(/,/g, ""))).toBeGreaterThan(
      parseFloat(initial!.replace(/,/g, ""))
    );
  });

  it("does not tick for a stream that is not active", () => {
    render(<StreamProgressVisualizer {...baseProps} status="cancelled" />);

    const initial = screen.getByTestId("streamed-amount").textContent;

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId("streamed-amount").textContent).toBe(initial);
    expect(screen.getByText(/stream paused/i)).toBeDefined();
  });
});
