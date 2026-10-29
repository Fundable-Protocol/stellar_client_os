import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryBackerDigestPreferencesDataSource,
  InMemoryBackerUpdatesSource,
  BackerDigestValidationError,
  dispatchBackerDigests,
  getBackerDigestPreference,
  renderBackerDigestEmail,
  setBackerDigestPreference,
} from "./backer-digest.service";

const MON_8AM_UTC = Date.UTC(2026, 0, 5, 8, 0, 0);
const HOUR = 3_600_000;

let prefs: InMemoryBackerDigestPreferencesDataSource;
let updates: InMemoryBackerUpdatesSource;
const sendEmail = vi.fn(async () => true);
const sender = { sendEmail };

beforeEach(() => {
  prefs = new InMemoryBackerDigestPreferencesDataSource();
  updates = new InMemoryBackerUpdatesSource();
  sendEmail.mockClear();
});

function seedUpdates() {
  updates.recordBacking("GBACKER", "c1");
  updates.recordBacking("GBACKER", "c2");
  updates.recordUpdate({ campaignId: "c1", campaignName: "Forest", title: "Planted 100", postedAt: MON_8AM_UTC - 2 * HOUR });
  updates.recordUpdate({ campaignId: "c2", campaignName: "Mangrove", title: "Site cleared", postedAt: MON_8AM_UTC - 3 * HOUR });
  updates.recordUpdate({ campaignId: "c3", campaignName: "Other", title: "Not backed", postedAt: MON_8AM_UTC - HOUR });
}

describe("preferences", () => {
  it("opts in, updates and opts out", async () => {
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "daily", email: "a@b.co", timezone: "UTC" }, prefs);
    expect((await getBackerDigestPreference("gbacker", prefs))?.frequency).toBe("daily");
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "weekly" }, prefs);
    const weekly = await getBackerDigestPreference("GBACKER", prefs);
    expect(weekly?.frequency).toBe("weekly");
    expect(weekly?.email).toBe("a@b.co");
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "off" }, prefs);
    expect((await getBackerDigestPreference("GBACKER", prefs))?.frequency).toBe("off");
  });

  it("rejects enabling without an email and missing backerId", async () => {
    await expect(setBackerDigestPreference({ backerId: "G1", frequency: "daily" }, prefs)).rejects.toBeInstanceOf(
      BackerDigestValidationError,
    );
    await expect(setBackerDigestPreference({ backerId: " ", frequency: "off" }, prefs)).rejects.toBeInstanceOf(
      BackerDigestValidationError,
    );
  });
});

describe("renderBackerDigestEmail", () => {
  it("groups updates by campaign and escapes HTML", () => {
    const { subject, html } = renderBackerDigestEmail("daily", [
      { campaignId: "c1", campaignName: "A <b>", title: "T1", postedAt: 1 },
      { campaignId: "c1", campaignName: "A <b>", title: "T2", summary: "s", postedAt: 2 },
    ]);
    expect(subject).toBe("Your Daily Digest: 2 updates across 1 campaign");
    expect(html).toContain("A &lt;b&gt;");
    expect(html).not.toContain("<b>");
  });
});

describe("dispatchBackerDigests", () => {
  it("sends one digest covering all backed campaigns at 8 AM local", async () => {
    seedUpdates();
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "daily", email: "a@b.co", timezone: "UTC" }, prefs, MON_8AM_UTC);
    const result = await dispatchBackerDigests(sender, MON_8AM_UTC, prefs, updates);
    expect(result).toEqual([{ backerId: "GBACKER", ok: true, skipped: false }]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0] as { to: string; html: string };
    expect(mail.to).toBe("a@b.co");
    expect(mail.html).toContain("Forest");
    expect(mail.html).toContain("Mangrove");
    expect(mail.html).not.toContain("Not backed");
  });

  it("does not send outside the 8 AM local hour", async () => {
    seedUpdates();
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "daily", email: "a@b.co", timezone: "Africa/Lagos" }, prefs);
    expect(await dispatchBackerDigests(sender, MON_8AM_UTC, prefs, updates)).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("is idempotent within the same period", async () => {
    seedUpdates();
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "daily", email: "a@b.co", timezone: "UTC" }, prefs);
    await dispatchBackerDigests(sender, MON_8AM_UTC, prefs, updates);
    await dispatchBackerDigests(sender, MON_8AM_UTC + 30 * 60_000, prefs, updates);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends weekly digests only on Monday", async () => {
    seedUpdates();
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "weekly", email: "a@b.co", timezone: "UTC" }, prefs);
    const tuesday = MON_8AM_UTC + 24 * HOUR;
    expect(await dispatchBackerDigests(sender, tuesday, prefs, updates)).toEqual([]);
    expect(await dispatchBackerDigests(sender, MON_8AM_UTC, prefs, updates)).toHaveLength(1);
  });

  it("skips opted-out backers and sends nothing when there are no updates", async () => {
    await setBackerDigestPreference({ backerId: "GOFF", frequency: "off" }, prefs);
    await setBackerDigestPreference({ backerId: "GQUIET", frequency: "daily", email: "q@b.co", timezone: "UTC" }, prefs);
    const result = await dispatchBackerDigests(sender, MON_8AM_UTC, prefs, updates);
    expect(result).toEqual([{ backerId: "GQUIET", ok: true, skipped: true }]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("reports failures without aborting and retries on the next run", async () => {
    seedUpdates();
    await setBackerDigestPreference({ backerId: "GBACKER", frequency: "daily", email: "a@b.co", timezone: "UTC" }, prefs);
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    const first = await dispatchBackerDigests(sender, MON_8AM_UTC, prefs, updates);
    expect(first[0]).toMatchObject({ ok: false, error: "smtp down" });
    const retry = await dispatchBackerDigests(sender, MON_8AM_UTC + 10 * 60_000, prefs, updates);
    expect(retry[0].ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
