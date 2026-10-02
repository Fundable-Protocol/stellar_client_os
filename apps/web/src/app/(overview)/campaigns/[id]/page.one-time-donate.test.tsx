import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Same workaround as page.test.tsx: resolve React 19's `use(params)` inline.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    use: (value: unknown) =>
      value instanceof Promise
        ? { id: "camp-101" }
        : (actual as { use: (v: unknown) => unknown }).use(value),
  };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("@/components/modules/campaign/donation/CampaignDonationPanel", () => ({
  CampaignDonationPanel: ({ campaignId }: { campaignId: string }) => (
    <div data-testid="donation-panel">{campaignId}</div>
  ),
}));

import CampaignDetailPage from "./page";

describe("Campaign detail page — one-time donation", () => {
  it("shows a One-time Donate button that opens the panel for this campaign", () => {
    render(<CampaignDetailPage params={Promise.resolve({ id: "camp-101" })} />);

    fireEvent.click(screen.getByRole("button", { name: /one-time donate/i }));

    expect(screen.getByTestId("donation-panel").textContent).toBe("camp-101");
  });
});