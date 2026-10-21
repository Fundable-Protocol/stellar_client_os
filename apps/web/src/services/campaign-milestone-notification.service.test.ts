import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CampaignMilestoneNotificationService,
  buildBrandedMilestoneEmailHtml,
} from "./campaign-milestone-notification.service";

describe("CampaignMilestoneNotificationService (#1174)", () => {
  let service: CampaignMilestoneNotificationService;

  beforeEach(() => {
    service = new CampaignMilestoneNotificationService();
  });

  it("allows creators to configure custom milestone thresholds", () => {
    const campaignId = "camp-custom-thresholds";
    expect(service.getMilestoneThresholds(campaignId)).toEqual([25, 50, 75, 100]);

    service.setCreatorMilestoneThresholds(campaignId, [10, 30, 60, 90, 100]);
    expect(service.getMilestoneThresholds(campaignId)).toEqual([10, 30, 60, 90, 100]);

    // Checks crossed thresholds based on creator config
    const newlyCrossed = service.calculateNewlyCrossedThresholds(campaignId, 5, 35);
    expect(newlyCrossed).toEqual([10, 30]);
  });

  it("builds a branded email template that links back to the campaign", () => {
    const html = buildBrandedMilestoneEmailHtml({
      to: "backer@example.com",
      recipientRole: "backer",
      campaignId: "camp-solar-reef",
      campaignName: "Coral Reef Solar Restoration",
      milestonePercentage: 75,
      raisedAmount: "7,500 XLM",
      goalAmount: "10,000 XLM",
      campaignUrl: "https://stellar.fundable.finance/campaigns/camp-solar-reef",
      optOutUrl: "https://stellar.fundable.finance/opt-out?id=123",
    });

    expect(html).toContain("Fundable Protocol");
    expect(html).toContain("Coral Reef Solar Restoration");
    expect(html).toContain("75%");
    expect(html).toContain("https://stellar.fundable.finance/campaigns/camp-solar-reef");
    expect(html).toContain("Opt out of milestone emails");
  });

  it("dispatches to creator and only sends to opted-in backers, honoring opt-outs", async () => {
    const mockEmailService = {
      sendEmail: vi.fn().mockResolvedValue({ id: "mock-email-id" }),
    };

    const campaignId = "camp-alpha";
    service.optOutBacker("optout@example.com", campaignId);

    const result = await service.dispatchMilestoneEmails({
      campaignId,
      campaignName: "Clean Water Reforestation",
      creatorEmail: "creator@example.com",
      milestonePercentage: 50,
      raisedAmount: "5,000 XLM",
      goalAmount: "10,000 XLM",
      backers: [
        { email: "supporter1@example.com", name: "Alice" },
        { email: "optout@example.com", name: "Bob" }, // Opted out via service
        { email: "explicitoptout@example.com", name: "Charlie", optedOut: true }, // Opted out via backer record
      ],
      emailService: mockEmailService,
    });

    expect(result.creatorSent).toBe(true);
    expect(result.backersSentCount).toBe(1);

    // Total emails sent: 1 creator + 1 opted-in backer
    expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(2);

    const sentEmails = mockEmailService.sendEmail.mock.calls.map((call) => call[0].to);
    expect(sentEmails).toContain("creator@example.com");
    expect(sentEmails).toContain("supporter1@example.com");
    expect(sentEmails).not.toContain("optout@example.com");
    expect(sentEmails).not.toContain("explicitoptout@example.com");
  });
});
