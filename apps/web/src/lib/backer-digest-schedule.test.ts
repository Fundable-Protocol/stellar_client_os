import { describe, expect, it } from "vitest";
import {
  digestPeriodKey,
  getLocalTimeParts,
  isBackerDigestDue,
  isInDigestWindow,
  parseBackerDigestPreference,
} from "./backer-digest-schedule";

// Mon 2026-01-05 08:00 in various zones.
const MON_8AM_UTC = Date.UTC(2026, 0, 5, 8, 0, 0);
const MON_8AM_LAGOS = Date.UTC(2026, 0, 5, 7, 0, 0); // Lagos = UTC+1
const TUE_8AM_UTC = Date.UTC(2026, 0, 6, 8, 0, 0);

describe("getLocalTimeParts", () => {
  it("resolves local date, hour and weekday", () => {
    expect(getLocalTimeParts(MON_8AM_LAGOS, "Africa/Lagos")).toEqual({
      date: "2026-01-05",
      hour: 8,
      weekday: "Mon",
    });
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(getLocalTimeParts(MON_8AM_UTC, "Not/AZone").hour).toBe(8);
  });
});

describe("isInDigestWindow", () => {
  it("never fires when off", () => {
    expect(isInDigestWindow("off", MON_8AM_UTC, "UTC")).toBe(false);
  });

  it("daily fires at 8 AM local on any weekday", () => {
    expect(isInDigestWindow("daily", MON_8AM_UTC, "UTC")).toBe(true);
    expect(isInDigestWindow("daily", TUE_8AM_UTC, "UTC")).toBe(true);
  });

  it("daily does not fire outside the 8 AM local hour", () => {
    expect(isInDigestWindow("daily", MON_8AM_UTC, "Africa/Lagos")).toBe(false); // 9 AM there
    expect(isInDigestWindow("daily", MON_8AM_LAGOS, "Africa/Lagos")).toBe(true);
  });

  it("weekly fires only on Monday at 8 AM local", () => {
    expect(isInDigestWindow("weekly", MON_8AM_UTC, "UTC")).toBe(true);
    expect(isInDigestWindow("weekly", TUE_8AM_UTC, "UTC")).toBe(false);
  });

  it("uses the local weekday, not the UTC weekday", () => {
    // Mon 8 AM in Auckland (UTC+13 in January) is Sun 19:00 UTC.
    const aucklandMon8 = Date.UTC(2026, 0, 4, 19, 0, 0);
    expect(isInDigestWindow("weekly", aucklandMon8, "Pacific/Auckland")).toBe(true);
  });
});

describe("isBackerDigestDue", () => {
  const prefs = { frequency: "daily" as const, timezone: "UTC" };

  it("is due in the window when not yet sent for the period", () => {
    expect(isBackerDigestDue(prefs, undefined, MON_8AM_UTC)).toBe(true);
  });

  it("is not due again within the same period", () => {
    const key = digestPeriodKey(MON_8AM_UTC, "UTC");
    expect(isBackerDigestDue(prefs, key, MON_8AM_UTC + 30 * 60_000)).toBe(false);
  });

  it("is due again on the next day", () => {
    const key = digestPeriodKey(MON_8AM_UTC, "UTC");
    expect(isBackerDigestDue(prefs, key, TUE_8AM_UTC)).toBe(true);
  });
});

describe("parseBackerDigestPreference", () => {
  it("allows off without an email", () => {
    expect(parseBackerDigestPreference({ frequency: "off" }).ok).toBe(true);
  });

  it("requires an email when enabled", () => {
    const result = parseBackerDigestPreference({ frequency: "daily" });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown frequencies and bad timezones", () => {
    expect(parseBackerDigestPreference({ frequency: "monthly", email: "a@b.co" }).ok).toBe(false);
    expect(
      parseBackerDigestPreference({ frequency: "daily", email: "a@b.co", timezone: "Nope/Zone" }).ok,
    ).toBe(false);
  });

  it("accepts a valid weekly preference", () => {
    expect(
      parseBackerDigestPreference({ frequency: "weekly", email: "a@b.co", timezone: "Africa/Lagos" }).ok,
    ).toBe(true);
  });
});
