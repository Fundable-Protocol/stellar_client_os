import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampaignLiveStreamPlayer } from "./CampaignLiveStreamPlayer";

const YT_ID = "dQw4w9WgXcQ";
const YT_URL = `https://www.youtube.com/watch?v=${YT_ID}`;
const YT_REPLAY_URL = "https://www.youtube.com/watch?v=abcdefghijk";

describe("CampaignLiveStreamPlayer", () => {
  it("embeds a live YouTube stream through the privacy-enhanced origin", () => {
    render(<CampaignLiveStreamPlayer platform="youtube" streamUrl={YT_URL} status="live" />);

    const iframe = screen.getByTestId("live-stream-embed");
    expect(iframe.getAttribute("src")).toBe(
      `https://www.youtube-nocookie.com/embed/${YT_ID}?rel=0`,
    );
    expect(screen.getByTestId("live-stream-badge")).toBeTruthy();
    expect(screen.getByTestId("live-stream-watch-link").textContent).toContain("Watch live on YouTube");
    expect(screen.queryByTestId("live-stream-offline-note")).toBeNull();
  });

  it("never renders a live indicator without a provider-confirmed live status", () => {
    render(<CampaignLiveStreamPlayer platform="youtube" streamUrl={YT_URL} status="offline" />);
    expect(screen.queryByTestId("live-stream-badge")).toBeNull();
    render(<CampaignLiveStreamPlayer platform="youtube" streamUrl={YT_URL} status="unknown" />);
    expect(screen.queryByTestId("live-stream-badge")).toBeNull();
  });

  it("surfaces the persisted replay once the broadcast ends", () => {
    render(
      <CampaignLiveStreamPlayer
        platform="youtube"
        streamUrl={YT_URL}
        replayUrl={YT_REPLAY_URL}
        status="offline"
      />,
    );

    expect(screen.getByTestId("live-stream-offline-note")).toBeTruthy();
    // The embed prefers the replay source while offline.
    expect(screen.getByTestId("live-stream-embed").getAttribute("src")).toContain("abcdefghijk");
    const replayLink = screen.getByTestId("live-stream-replay-link");
    expect(replayLink.getAttribute("href")).toBe(YT_REPLAY_URL);
    expect(replayLink.textContent).toContain("Watch replay");
    expect(screen.getByTestId("live-stream-open-source-link").getAttribute("href")).toBe(YT_URL);
  });

  it("falls back to the stream URL as the replay link when no replay was saved", () => {
    render(<CampaignLiveStreamPlayer platform="youtube" streamUrl={YT_URL} status="offline" />);
    expect(screen.getByTestId("live-stream-replay-link").getAttribute("href")).toBe(YT_URL);
    expect(screen.queryByTestId("live-stream-open-source-link")).toBeNull();
  });

  it("shows an honest note instead of a live claim when the status is unknown", () => {
    render(<CampaignLiveStreamPlayer platform="youtube" streamUrl={YT_URL} status="unknown" />);
    expect(screen.getByTestId("live-stream-status-unknown").textContent).toContain(
      "Live status could not be verified",
    );
    expect(screen.queryByTestId("live-stream-badge")).toBeNull();
  });

  it("distinguishes an unreachable status endpoint", () => {
    render(<CampaignLiveStreamPlayer platform="youtube" streamUrl={YT_URL} status={null} statusUnavailable />);
    expect(screen.getByTestId("live-stream-status-unknown").textContent).toContain(
      "temporarily unavailable",
    );
  });

  it("waits for the embedding host before loading a Twitch player", () => {
    render(<CampaignLiveStreamPlayer platform="twitch" streamUrl="https://www.twitch.tv/somechannel" status="live" />);

    const iframe = screen.getByTestId("live-stream-embed");
    const src = iframe.getAttribute("src") ?? "";
    expect(src.startsWith("https://player.twitch.tv/?")).toBe(true);
    expect(src).toContain("channel=somechannel");
    expect(src).toContain(`parent=${window.location.hostname}`);
  });

  it("prefers the persisted replay as the Twitch embed source while offline", () => {
    render(
      <CampaignLiveStreamPlayer
        platform="twitch"
        streamUrl="https://www.twitch.tv/somechannel"
        replayUrl="https://www.twitch.tv/videos/424242"
        status="offline"
      />,
    );
    const src = screen.getByTestId("live-stream-embed").getAttribute("src") ?? "";
    expect(src).toContain("video=424242");
    expect(src).toContain(`parent=${window.location.hostname}`);
  });

  it("refuses to embed a tampered record and degrades to a plain link", () => {
    render(
      <CampaignLiveStreamPlayer platform="youtube" streamUrl="https://evil.example.com/watch?v=x" status="unknown" />,
    );
    expect(screen.queryByTestId("live-stream-embed")).toBeNull();
    expect(screen.getByText(/no longer be embedded/)).toBeTruthy();
  });

  it("shows the creator-supplied title when present", () => {
    render(
      <CampaignLiveStreamPlayer platform="youtube" streamUrl={YT_URL} title="Mangrove planting update" status="live" />,
    );
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("Mangrove planting update");
  });
});
