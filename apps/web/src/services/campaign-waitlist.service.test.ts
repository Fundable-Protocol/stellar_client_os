import { beforeEach, describe, expect, it } from "vitest";
import {
  CampaignWaitlistValidationError,
  countCampaignWaitlist,
  joinCampaignWaitlist,
  resetCampaignWaitlistDataSource,
} from "./campaign-waitlist.service";

const CAMPAIGN_ID = "camp-101";

describe("campaign waitlist service", () => {
  beforeEach(() => {
    resetCampaignWaitlistDataSource();
  });

  it("joins the waitlist and counts the signups", async () => {
    const entry = await joinCampaignWaitlist(CAMPAIGN_ID, "Person@Example.com");
    expect(entry.email).toBe("person@example.com");
    expect(entry.notifyOnLaunch).toBe(true);
    expect(await countCampaignWaitlist(CAMPAIGN_ID)).toBe(1);
  });

  it("is idempotent for the same email", async () => {
    await joinCampaignWaitlist(CAMPAIGN_ID, "person@example.com");
    await joinCampaignWaitlist(CAMPAIGN_ID, " person@example.com ");
    expect(await countCampaignWaitlist(CAMPAIGN_ID)).toBe(1);
  });

  it("keeps campaigns independent", async () => {
    await joinCampaignWaitlist(CAMPAIGN_ID, "person@example.com");
    await joinCampaignWaitlist("camp-202", "person@example.com");
    expect(await countCampaignWaitlist(CAMPAIGN_ID)).toBe(1);
    expect(await countCampaignWaitlist("camp-202")).toBe(1);
  });

  it("rejects an invalid email address", async () => {
    await expect(
      joinCampaignWaitlist(CAMPAIGN_ID, "not-an-email"),
    ).rejects.toBeInstanceOf(CampaignWaitlistValidationError);
  });

  it("rejects a missing campaign id", async () => {
    await expect(
      joinCampaignWaitlist("", "person@example.com"),
    ).rejects.toBeInstanceOf(CampaignWaitlistValidationError);
  });
});
