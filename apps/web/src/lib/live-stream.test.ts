import { describe, expect, it } from "vitest";
import {
  MAX_LIVE_STREAM_URL_LENGTH,
  buildLiveStreamEmbedUrl,
  formatLiveStreamPlatform,
  isValidLiveStreamUrl,
  parseLiveStreamUrl,
  resolveLiveStreamPlatform,
} from "./live-stream";

const YT_ID = "dQw4w9WgXcQ";

describe("parseLiveStreamUrl — accepted YouTube URLs", () => {
  it.each([
    ["canonical watch URL", `https://www.youtube.com/watch?v=${YT_ID}`],
    ["watch URL with tracking params", `https://www.youtube.com/watch?v=${YT_ID}&t=42&list=PL123`],
    ["live URL", `https://www.youtube.com/live/${YT_ID}`],
    ["embed URL", `https://www.youtube.com/embed/${YT_ID}`],
    ["shorts URL", `https://www.youtube.com/shorts/${YT_ID}`],
    ["legacy /v/ URL", `https://www.youtube.com/v/${YT_ID}`],
    ["short link", `https://youtu.be/${YT_ID}`],
    ["m.youtube host", `https://m.youtube.com/watch?v=${YT_ID}`],
    ["root URL with v param", `https://www.youtube.com/?v=${YT_ID}`],
    ["http upgraded to https", `http://www.youtube.com/watch?v=${YT_ID}`],
    ["http short link upgraded", `http://youtu.be/${YT_ID}`],
  ])("parses %s", (_label, url) => {
    const parsed = parseLiveStreamUrl(url);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.platform).toBe("youtube");
    expect(parsed.canonicalUrl).toBe(`https://www.youtube.com/watch?v=${YT_ID}`);
    if (parsed.platform === "youtube") expect(parsed.videoId).toBe(YT_ID);
  });
});

describe("parseLiveStreamUrl — accepted Twitch URLs", () => {
  it("parses a channel URL and canonicalises it", () => {
    const parsed = parseLiveStreamUrl("https://www.twitch.tv/SomeChannel");
    expect(parsed).toMatchObject({
      ok: true,
      platform: "twitch",
      kind: "channel",
      channel: "somechannel",
      canonicalUrl: "https://www.twitch.tv/somechannel",
    });
  });

  it("parses mobile and bare-host channel URLs", () => {
    expect(parseLiveStreamUrl("https://m.twitch.tv/somechannel").ok).toBe(true);
    expect(parseLiveStreamUrl("https://twitch.tv/somechannel").ok).toBe(true);
  });

  it("parses a VOD URL", () => {
    expect(parseLiveStreamUrl("https://www.twitch.tv/videos/123456789")).toMatchObject({
      ok: true,
      kind: "video",
      videoId: "123456789",
      canonicalUrl: "https://www.twitch.tv/videos/123456789",
    });
  });
});

describe("parseLiveStreamUrl — rejected URLs", () => {
  it.each([
    ["not a string", 123],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["not a URL", "youtube.com/watch"],
    ["ftp scheme", `ftp://www.youtube.com/watch?v=${YT_ID}`],
    ["javascript scheme", `javascript:alert(1)//${YT_ID}`],
    ["embedded credentials", `https://user:pass@www.youtube.com/watch?v=${YT_ID}`],
    ["custom port", `https://www.youtube.com:8443/watch?v=${YT_ID}`],
    ["suffix-spoofed host", `https://youtube.com.evil.io/watch?v=${YT_ID}`],
    ["lookalike host", `https://notyoutube.com/watch?v=${YT_ID}`],
    ["unsupported provider (Vimeo)", "https://vimeo.com/12345"],
    ["YouTube playlist", "https://www.youtube.com/playlist?list=PL123"],
    ["YouTube handle", "https://www.youtube.com/@somehandle"],
    ["YouTube channel page", "https://www.youtube.com/@somehandle/videos"],
    ["YouTube search page", "https://www.youtube.com/results?search_query=live"],
    ["too-short video id", "https://www.youtube.com/watch?v=short"],
    ["Twitch browse page", "https://www.twitch.tv/directory"],
    ["Twitch clip", "https://www.twitch.tv/somechannel/clip/SomeClipName"],
    ["Twitch short handle", "https://www.twitch.tv/ab"],
    ["Twitch non-numeric VOD", "https://www.twitch.tv/videos/abc"],
  ])("rejects %s", (_label, url) => {
    const parsed = parseLiveStreamUrl(url);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(0);
  });

  it("rejects URLs longer than the limit", () => {
    const long = `https://www.youtube.com/watch?v=${YT_ID}&x=${"a".repeat(MAX_LIVE_STREAM_URL_LENGTH)}`;
    expect(parseLiveStreamUrl(long).ok).toBe(false);
  });

  it("is used by isValidLiveStreamUrl", () => {
    expect(isValidLiveStreamUrl(`https://www.youtube.com/watch?v=${YT_ID}`)).toBe(true);
    expect(isValidLiveStreamUrl("https://evil.example.com/live")).toBe(false);
    expect(isValidLiveStreamUrl(null)).toBe(false);
  });
});

describe("resolveLiveStreamPlatform", () => {
  it("re-validates a matching platform", () => {
    const parsed = resolveLiveStreamPlatform("youtube", `https://www.youtube.com/watch?v=${YT_ID}`);
    expect(parsed).not.toBeNull();
  });

  it("returns null when the platform and URL disagree", () => {
    expect(resolveLiveStreamPlatform("twitch", `https://www.youtube.com/watch?v=${YT_ID}`)).toBeNull();
    expect(resolveLiveStreamPlatform("youtube", "https://www.twitch.tv/somechannel")).toBeNull();
  });

  it("returns null for tampered or invalid URLs", () => {
    expect(resolveLiveStreamPlatform("youtube", "https://evil.example.com/watch")).toBeNull();
    expect(resolveLiveStreamPlatform("youtube", "not a url")).toBeNull();
    expect(resolveLiveStreamPlatform("youtube", 42)).toBeNull();
  });
});

describe("buildLiveStreamEmbedUrl", () => {
  it("builds a YouTube privacy-enhanced embed from the validated id", () => {
    const embed = buildLiveStreamEmbedUrl({
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=${YT_ID}&t=99`,
    });
    expect(embed).toBe(`https://www.youtube-nocookie.com/embed/${YT_ID}?rel=0`);
  });

  it("builds a Twitch channel embed with the required parent host", () => {
    const embed = buildLiveStreamEmbedUrl(
      { platform: "twitch", url: "https://www.twitch.tv/SomeChannel" },
      { parent: "Example.COM" },
    );
    expect(embed).toBe("https://player.twitch.tv/?channel=somechannel&parent=example.com");
  });

  it("builds a Twitch VOD embed with the required parent host", () => {
    const embed = buildLiveStreamEmbedUrl(
      { platform: "twitch", url: "https://www.twitch.tv/videos/999" },
      { parent: "localhost" },
    );
    expect(embed).toBe("https://player.twitch.tv/?video=999&parent=localhost");
  });

  it("returns null for Twitch without a parent so the player can wait", () => {
    expect(buildLiveStreamEmbedUrl({ platform: "twitch", url: "https://www.twitch.tv/somechannel" })).toBeNull();
    expect(
      buildLiveStreamEmbedUrl({ platform: "twitch", url: "https://www.twitch.tv/somechannel" }, { parent: "  " }),
    ).toBeNull();
  });

  it("never emits an embed for a tampered or mismatched URL", () => {
    expect(buildLiveStreamEmbedUrl({ platform: "youtube", url: "https://evil.example.com/x" })).toBeNull();
    expect(buildLiveStreamEmbedUrl({ platform: "youtube", url: "https://www.twitch.tv/somechannel" })).toBeNull();
    expect(buildLiveStreamEmbedUrl({ platform: "twitch", url: `https://www.youtube.com/watch?v=${YT_ID}` }, { parent: "x.io" })).toBeNull();
  });

  it("never returns the raw user-supplied URL as an embed", () => {
    const raw = `https://www.youtube.com/watch?v=${YT_ID}`;
    const embed = buildLiveStreamEmbedUrl({ platform: "youtube", url: raw });
    expect(embed).not.toBe(raw);
    expect(embed).toContain("youtube-nocookie.com");
  });
});

describe("formatLiveStreamPlatform", () => {
  it("labels providers for display", () => {
    expect(formatLiveStreamPlatform("youtube")).toBe("YouTube");
    expect(formatLiveStreamPlatform("twitch")).toBe("Twitch");
  });
});
