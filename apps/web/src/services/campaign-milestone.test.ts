import { describe, expect, it, vi } from "vitest";
import {
  crossedCampaignMilestones,
  InMemoryCampaignDataSource,
  recordCampaignContribution,
  type CampaignRecord,
} from "./campaign.service";
import type { SendEmailOptions } from "./email.service";

const campaign = (overrides: Partial<CampaignRecord> = {}): CampaignRecord => ({
  id: "campaign-1",
  creator: "GCREATOR",
  creatorEmail: "creator@example.com",
  name: "Clean water project",
  description: "Help provide clean water.",
  status: "ACTIVE",
  goalAmount: "1000",
  raisedAmount: "0",
  sponsorCount: 0,
  treeCount: 0,
  createdAt: 1,
  updatedAt: 1,
  statusChangedAt: 1,
  sponsors: [],
  statusHistory: [],
  milestonesNotified: [],
  ...overrides,
});

describe("campaign milestones", () => {
  it("detects every threshold crossed by a contribution", () => {
    expect(crossedCampaignMilestones("0", "1000", "100")).toEqual([25, 50, 75, 100]);
  });

  it("emails the creator once for each newly reached milestone", async () => {
    const source = new InMemoryCampaignDataSource();
    await source.saveCampaign(campaign());
    const sent: SendEmailOptions[] = [];
    const emailService = { sendEmail: vi.fn(async (email: SendEmailOptions) => { sent.push(email); return true; }) };

    const result = await recordCampaignContribution("campaign-1", "500", source, emailService, 2);
    expect(result?.milestones).toEqual([25, 50]);
    expect(sent.map((email) => email.subject)).toEqual([
      "Clean water project reached 25% of its goal",
      "Clean water project reached 50% of its goal",
    ]);

    await recordCampaignContribution("campaign-1", "500", source, emailService, 3);
    expect(sent).toHaveLength(4);
    expect(sent[2].subject).toContain("75%");
    expect(sent[3].subject).toContain("100%");
  });
});
