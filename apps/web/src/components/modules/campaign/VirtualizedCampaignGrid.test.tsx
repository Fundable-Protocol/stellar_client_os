import React from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { installJsdomLayout } from "@/test-utils/jsdom-layout";
import { VirtualizedCampaignGrid, computeColumnCount } from "./VirtualizedCampaignGrid";

// jsdom has no layout engine; give elements a viewport-sized box so the real
// @tanstack/react-virtual implementation can run in tests.
let restoreLayout: () => void;

beforeAll(() => {
  restoreLayout = installJsdomLayout(1200, 600);
});

afterAll(() => {
  restoreLayout();
});

interface Campaign {
  id: string;
  title: string;
}

function makeCampaigns(count: number): Campaign[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `campaign-${index}`,
    title: `Campaign ${index}`,
  }));
}

function gridProps(items: Campaign[], options: { emptyState?: React.ReactNode } = {}) {
  return {
    items,
    getItemKey: (campaign: Campaign) => campaign.id,
    minColumnWidth: 320,
    maxColumns: 3,
    initialColumns: 3,
    estimateRowHeight: 200,
    overscan: 3,
    ariaLabel: "Campaign results",
    emptyState: options.emptyState,
    renderItem: (campaign: Campaign) => <div data-testid="campaign-card">{campaign.title}</div>,
  };
}

function renderGrid(items: Campaign[], options: { emptyState?: React.ReactNode } = {}) {
  return render(<VirtualizedCampaignGrid {...gridProps(items, options)} />);
}

describe("computeColumnCount", () => {
  it("fits as many columns as the width allows", () => {
    // 1200px with 320px cards and 24px gutters => 3 columns.
    expect(computeColumnCount(1200, 320, 24)).toBe(3);
    expect(computeColumnCount(600, 320, 24)).toBe(1);
    expect(computeColumnCount(1280, 320, 24)).toBe(3);
  });

  it("respects the maximum column cap", () => {
    expect(computeColumnCount(2000, 320, 24, 2)).toBe(2);
  });

  it("never returns less than one column", () => {
    expect(computeColumnCount(0, 320, 24)).toBe(1);
    expect(computeColumnCount(Number.NaN, 320, 24)).toBe(1);
    expect(computeColumnCount(100, 0, 24)).toBe(1);
  });
});

describe("VirtualizedCampaignGrid", () => {
  it("only mounts the visible window of a 10k campaign list", () => {
    renderGrid(makeCampaigns(10_000));

    const cards = screen.getAllByTestId("campaign-card");

    expect(cards.length).toBeGreaterThan(0);
    // A 10k list must never hit the DOM in full — this is the whole point of
    // the change. The exact number depends on the virtualiser, so assert a
    // generous upper bound rather than a brittle exact count.
    expect(cards.length).toBeLessThan(100);
    expect(screen.getByText("Campaign 0")).toBeTruthy();
    expect(screen.queryByText("Campaign 9999")).toBeNull();
  });

  it("moves the rendered window when the list is scrolled", () => {
    renderGrid(makeCampaigns(5_000));

    const list = screen.getByRole("list", { name: "Campaign results" });
    list.scrollTop = 20_000;
    fireEvent.scroll(list);

    expect(screen.queryByText("Campaign 0")).toBeNull();
    expect(screen.getAllByTestId("campaign-card").length).toBeLessThan(100);
  });

  it("returns to the top when the collection shrinks after a deep scroll", () => {
    const { rerender } = renderGrid(makeCampaigns(5_000));
    const list = screen.getByRole("list", { name: "Campaign results" });

    list.scrollTop = 20_000;
    fireEvent.scroll(list);
    expect(screen.queryByText("Campaign 0")).toBeNull();

    rerender(<VirtualizedCampaignGrid {...gridProps(makeCampaigns(3))} />);
    // Browsers emit a scroll event after a programmatic scrollTop change.
    fireEvent.scroll(list);

    expect(screen.getByText("Campaign 0")).toBeTruthy();
  });

  it("lays the visible rows out in responsive grid columns", () => {
    renderGrid(makeCampaigns(30));

    const firstRow = document.querySelector('[data-index="0"]');
    expect(firstRow).toBeTruthy();

    const grid = firstRow?.firstElementChild as HTMLElement | null;
    expect(grid?.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");

    const items = screen.getAllByRole("listitem");
    expect(items[0]?.getAttribute("aria-posinset")).toBe("1");
    expect(items[0]?.getAttribute("aria-setsize")).toBe("30");
    expect(items.slice(0, 3).map((item) => item.textContent)).toEqual([
      "Campaign 0",
      "Campaign 1",
      "Campaign 2",
    ]);
  });

  it("renders the empty state when there are no campaigns", () => {
    renderGrid([], { emptyState: <p>No campaigns found</p> });

    expect(screen.getByText("No campaigns found")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
