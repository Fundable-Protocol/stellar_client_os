import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getVideoEmbedUrl, PledgeThankYouContent } from "./PledgeThankYouContent";

describe("campaign thank-you content", () => {
  it("embeds supported YouTube and Vimeo links without trusting arbitrary hosts", () => {
    expect(getVideoEmbedUrl("https://youtu.be/abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
    expect(getVideoEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube-nocookie.com/embed/abc123");
    expect(getVideoEmbedUrl("https://vimeo.com/12345")).toBe("https://player.vimeo.com/video/12345");
    expect(getVideoEmbedUrl("https://example.com/video")).toBeNull();
    expect(getVideoEmbedUrl("javascript:alert(1)")).toBeNull();
  });

  it("renders creator rich text and next steps as text, not HTML", () => {
    render(
      <PledgeThankYouContent
        details={{
          greeting: "Thank you!",
          body: "Your **support** matters.",
          nextSteps: "We will *send updates* soon.",
        }}
      />,
    );
    expect(screen.getByText("support").tagName).toBe("STRONG");
    expect(screen.getByText("send updates").tagName).toBe("EM");
  });
});
