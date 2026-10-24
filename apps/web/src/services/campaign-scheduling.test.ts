import { describe, expect, it } from "vitest";
import { getPublicationState, isCampaignVisibleToPublic } from "./campaign-scheduling";

describe("campaign scheduling", () => {
  const now = Date.parse("2026-01-01T00:00:00.000Z");
  it("keeps a future campaign scheduled and private", () => {
    const publishAt = "2026-01-02T00:00:00.000Z";
    expect(getPublicationState(publishAt, now)).toBe("scheduled");
    expect(isCampaignVisibleToPublic({ publishAt, state: "scheduled" }, now)).toBe(false);
  });
  it("activates campaigns at their publication time", () => {
    const publishAt = "2026-01-01T00:00:00.000Z";
    expect(getPublicationState(publishAt, now)).toBe("active");
    expect(isCampaignVisibleToPublic({ publishAt, state: "active" }, now)).toBe(true);
  });
});
