import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// The real provider module cannot load in tests (its @stellar/freighter-api
// version does not export `getAddress`), so the wallet context is provided by
// a lightweight mock the same way other campaign tests do.
vi.mock("@/providers/StellarWalletProvider", async () => {
  const react = await import("react");
  return { WalletContext: react.createContext(undefined) };
});

import { WalletContext } from "@/providers/StellarWalletProvider";
import { CampaignLiveStreamSection } from "./CampaignLiveStreamSection";

const CREATOR = "GSECTIONCREATORADDRESS";
const OTHER = "GSECTIONOTHERADDRESS";
const YT_ID = "dQw4w9WgXcQ";
const STREAM_URL = `https://www.youtube.com/watch?v=${YT_ID}`;
const CAMPAIGN_ID = "camp-section-1";

const configUrl = `/api/campaigns/${CAMPAIGN_ID}/stream`;
const statusUrl = `/api/campaigns/${CAMPAIGN_ID}/stream-status`;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const streamConfig = (creator: string, liveStream: unknown = null) =>
  jsonResponse({ campaignId: CAMPAIGN_ID, creator, liveStream });
const streamStatus = (status: string | null) =>
  jsonResponse({
    campaignId: CAMPAIGN_ID,
    liveStream: status ? { platform: "youtube", streamUrl: STREAM_URL, replayUrl: null, title: null } : null,
    status,
    checkedAt: status ? Date.now() : null,
    source: status ? "provider" : null,
    reason: status === "unknown" ? "not_configured" : null,
  });

const fetchMock = vi.fn();

function renderSection(address: string | null) {
  return render(
    <WalletContext.Provider value={{ address } as unknown as React.ContextType<typeof WalletContext>}>
      <CampaignLiveStreamSection campaignId={CAMPAIGN_ID} />
    </WalletContext.Provider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CampaignLiveStreamSection", () => {
  it("shows a loading state, then the player for a provider-confirmed live stream", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === statusUrl) return streamStatus("live");
      return streamConfig(OTHER, {
        platform: "youtube",
        streamUrl: STREAM_URL,
        addedAt: 1,
        updatedAt: 1,
      });
    });

    renderSection(null);

    expect(screen.getByTestId("live-stream-loading")).toBeTruthy();
    const section = await screen.findByTestId("campaign-live-stream-section");
    expect(section).toBeTruthy();
    expect(screen.getByTestId("live-stream-embed").getAttribute("src")).toBe(
      `https://www.youtube-nocookie.com/embed/${YT_ID}?rel=0`,
    );
    // Acceptance: only provider-confirmed live streams get the indicator.
    expect(screen.getByTestId("live-stream-badge")).toBeTruthy();
    // Not the creator and no management form.
    expect(screen.queryByTestId("campaign-live-stream-manager")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(configUrl);
    expect(fetchMock).toHaveBeenCalledWith(statusUrl);
  });

  it("hides the live indicator when the provider reports offline", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === statusUrl) return streamStatus("offline");
      return streamConfig(OTHER, { platform: "youtube", streamUrl: STREAM_URL, addedAt: 1, updatedAt: 1 });
    });

    renderSection(null);
    await screen.findByTestId("campaign-live-stream-section");
    expect(screen.queryByTestId("live-stream-badge")).toBeNull();
    expect(screen.getByTestId("live-stream-offline-note")).toBeTruthy();
  });

  it("renders nothing for a viewer when the campaign has no stream", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === statusUrl ? streamStatus(null) : streamConfig(OTHER, null),
    );

    const { container } = renderSection(null);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.querySelector("[data-testid='campaign-live-stream-section']")).toBeNull();
    expect(screen.queryByTestId("campaign-live-stream-manager")).toBeNull();
  });

  it("shows the management form to the campaign creator even without a stream", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === statusUrl ? streamStatus(null) : streamConfig(CREATOR, null),
    );

    renderSection(CREATOR);
    await screen.findByTestId("campaign-live-stream-section");
    expect(screen.getByTestId("campaign-live-stream-manager")).toBeTruthy();
    expect(screen.getByText("Add a live stream")).toBeTruthy();
    expect(screen.queryByTestId("campaign-live-stream-embed")).toBeNull();
    expect(screen.queryByTestId("live-stream-embed")).toBeNull();
  });

  it("does not show the management form to a wallet that is not the creator", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === statusUrl ? streamStatus(null) : streamConfig(CREATOR, null),
    );

    renderSection(OTHER);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("campaign-live-stream-manager")).toBeNull();
  });

  it("surfaces a load failure with a working retry", async () => {
    let failing = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (failing) return jsonResponse({ error: "boom" }, 500);
      if (url === statusUrl) return streamStatus("unknown");
      return streamConfig(OTHER, { platform: "youtube", streamUrl: STREAM_URL, addedAt: 1, updatedAt: 1 });
    });

    renderSection(null);
    const alert = await screen.findByTestId("live-stream-error");
    expect(alert.getAttribute("role")).toBe("alert");

    failing = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    await screen.findByTestId("campaign-live-stream-section");
    expect(screen.queryByTestId("live-stream-error")).toBeNull();
  });

  it("keeps the player rendered with an unavailable note when only the status call fails", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === statusUrl) return jsonResponse({ error: "down" }, 500);
      return streamConfig(OTHER, { platform: "youtube", streamUrl: STREAM_URL, addedAt: 1, updatedAt: 1 });
    });

    renderSection(null);
    await screen.findByTestId("campaign-live-stream-section");
    expect(screen.getByTestId("live-stream-embed")).toBeTruthy();
    expect(screen.getByTestId("live-stream-status-unknown").textContent).toContain("temporarily unavailable");
    expect(screen.queryByTestId("live-stream-badge")).toBeNull();
  });

  it("lets the creator save a validated stream through the manager", async () => {
    let saved = false;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        saved = true;
        return streamConfig(CREATOR, { platform: "youtube", streamUrl: STREAM_URL, addedAt: 1, updatedAt: 2 });
      }
      if (url === statusUrl) return streamStatus(saved ? "live" : null);
      return saved
        ? streamConfig(CREATOR, { platform: "youtube", streamUrl: STREAM_URL, addedAt: 1, updatedAt: 2 })
        : streamConfig(CREATOR, null);
    });

    renderSection(CREATOR);
    await screen.findByTestId("campaign-live-stream-manager");

    const input = screen.getByLabelText(/stream url/i);
    fireEvent.change(input, { target: { value: STREAM_URL } });
    fireEvent.click(screen.getByRole("button", { name: /save stream/i }));

    await waitFor(() => expect(saved).toBe(true));
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "PUT");
    expect(putCall).toBeTruthy();
    expect(String(putCall?.[0])).toBe(configUrl);
    const payload = JSON.parse(String((putCall?.[1] as RequestInit).body));
    expect(payload).toMatchObject({ streamUrl: STREAM_URL, requestedBy: CREATOR });
    await screen.findByTestId("live-stream-embed");
  });

  it("shows an inline validation error for an unsupported URL without calling the API", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === statusUrl ? streamStatus(null) : streamConfig(CREATOR, null),
    );

    renderSection(CREATOR);
    await screen.findByTestId("campaign-live-stream-manager");

    fireEvent.change(screen.getByLabelText(/stream url/i), {
      target: { value: "https://evil.example.com/live" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save stream/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Only YouTube and Twitch");
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "PUT")).toBe(false);
  });
});
