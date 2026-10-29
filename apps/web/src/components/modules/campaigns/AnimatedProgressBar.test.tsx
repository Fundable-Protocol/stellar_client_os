import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import { AnimatedProgressBar } from "./AnimatedProgressBar";

function renderBar(
  locale: "en" | "ar" | "he",
  props: Partial<React.ComponentProps<typeof AnimatedProgressBar>> = {},
) {
  return render(
    <I18nProvider initialLocale={locale}>
      <AnimatedProgressBar totalRaised={500} targetAmount={1000} minTarget={250} {...props} />
    </I18nProvider>,
  );
}

describe("AnimatedProgressBar localization", () => {
  it("renders the English labels and funding summary", () => {
    renderBar("en");

    expect(screen.getByText("Campaign Funding Progress")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "50% funded, 500 of 1,000 XLM",
    );
    expect(screen.getByText("Total Raised")).toBeTruthy();
  });

  it("renders the Arabic and Hebrew labels", () => {
    const { unmount } = renderBar("ar");
    expect(screen.getByText("تقدم تمويل الحملة")).toBeTruthy();
    unmount();

    renderBar("he");
    expect(screen.getByText("התקדמות המימון של הקמפיין")).toBeTruthy();
    expect(screen.getByText("סך הגיוס")).toBeTruthy();
  });

  it("anchors the fill to the inline start in RTL", async () => {
    renderBar("he");

    const fill = screen.getByTestId("campaign-progress-fill");
    await waitFor(() => expect(fill.getAttribute("style")).toContain("width: 50%"));

    expect(fill.getAttribute("style")).toContain("inset-inline-start");
    expect(fill.className).toContain("rtl:bg-gradient-to-l");
  });

  it("flips milestone markers to mirror in RTL", () => {
    const { unmount } = renderBar("en");
    const ltrMarkers = screen.getAllByTestId("campaign-progress-milestone");
    expect(ltrMarkers[0].className).toContain("-translate-x-1/2");
    unmount();

    renderBar("he");
    const rtlMarkers = screen.getAllByTestId("campaign-progress-milestone");
    expect(rtlMarkers[0].className).toContain("translate-x-1/2");
    expect(rtlMarkers[0].className).not.toContain("-translate-x-1/2");
  });

  it("lays out stretch tiers from the inline start", async () => {
    renderBar("he", {
      totalRaised: 1500,
      targetAmount: 1000,
      minTarget: 500,
      stretchTarget: 2000,
    });

    const minSegment = screen.getByTestId("campaign-progress-min-segment");
    await waitFor(() => expect(minSegment.getAttribute("style")).toContain("width: 25%"));
    expect(screen.getByTestId("campaign-progress-goal-segment").getAttribute("style")).toContain(
      "inset-inline-start: 25%",
    );
    expect(screen.getByTestId("campaign-progress-stretch-segment").getAttribute("style")).toContain(
      "inset-inline-start: 50%",
    );
  });
});
