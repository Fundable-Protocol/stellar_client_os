import { EmailService } from "./campaign-donation.service";

export interface MilestoneNotificationEmailPayload {
  to: string;
  recipientName?: string;
  recipientRole: "creator" | "backer";
  campaignId: string;
  campaignName: string;
  milestonePercentage: number;
  raisedAmount: string;
  goalAmount: string;
  campaignUrl: string;
  optOutUrl: string;
}

export interface BackerMilestoneRecipient {
  email: string;
  name?: string;
  optedOut?: boolean;
}

export function buildBrandedMilestoneEmailHtml(payload: MilestoneNotificationEmailPayload): string {
  const isCreator = payload.recipientRole === "creator";
  const headline = isCreator
    ? `🎉 Your campaign reached ${payload.milestonePercentage}% of its funding goal!`
    : `🚀 Good news! A campaign you backed reached ${payload.milestonePercentage}% of its funding goal.`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${payload.campaignName} - ${payload.milestonePercentage}% Funded</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
      <span style="font-size: 20px; font-weight: 800; color: #10b981; letter-spacing: -0.02em;">Fundable Protocol</span>
      <span style="background: rgba(16, 185, 129, 0.1); color: #10b981; font-size: 11px; padding: 2px 8px; border-radius: 9999px; font-weight: 600;">Stellar Ecosystem</span>
    </div>

    <h1 style="color: #ffffff; font-size: 22px; font-weight: 700; margin: 0 0 16px 0;">
      ${headline}
    </h1>

    <p style="color: #a1a1aa; font-size: 15px; line-height: 1.6; margin: 0 0 24px 0;">
      <strong>${payload.campaignName}</strong> has hit a major milestone, reaching <strong>${payload.milestonePercentage}%</strong> of its target funding.
    </p>

    <div style="background-color: #27272a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; font-size: 13px; color: #a1a1aa; margin-bottom: 8px;">
        <span>Progress: ${payload.milestonePercentage}%</span>
        <span>${payload.raisedAmount} / ${payload.goalAmount}</span>
      </div>
      <div style="width: 100%; height: 8px; background-color: #3f3f46; border-radius: 9999px; overflow: hidden;">
        <div style="width: ${Math.min(100, payload.milestonePercentage)}%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); border-radius: 9999px;"></div>
      </div>
    </div>

    <div style="text-align: center; margin-bottom: 32px;">
      <a href="${payload.campaignUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);">
        View Campaign on Fundable
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #27272a; margin: 24px 0;" />

    <p style="font-size: 12px; color: #71717a; text-align: center; margin: 0 0 8px 0;">
      You received this email because you are a verified creator or backer on Fundable Protocol.
    </p>
    <p style="font-size: 12px; color: #71717a; text-align: center; margin: 0;">
      Don't want to receive milestone updates? <a href="${payload.optOutUrl}" style="color: #a1a1aa; text-decoration: underline;">Opt out of milestone emails</a>.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export class CampaignMilestoneNotificationService {
  private customThresholds: Map<string, number[]> = new Map();
  private optOutBackers: Set<string> = new Set(); // set of "backerEmail:campaignId"

  public setCreatorMilestoneThresholds(campaignId: string, thresholds: number[]): void {
    const valid = Array.from(new Set(thresholds))
      .filter((n) => typeof n === "number" && n > 0 && n <= 100)
      .sort((a, b) => a - b);
    this.customThresholds.set(campaignId, valid.length ? valid : [25, 50, 75, 100]);
  }

  public getMilestoneThresholds(campaignId: string): number[] {
    return this.customThresholds.get(campaignId) || [25, 50, 75, 100];
  }

  public optOutBacker(backerEmail: string, campaignId: string): void {
    this.optOutBackers.add(`${backerEmail.toLowerCase()}:${campaignId}`);
  }

  public optInBacker(backerEmail: string, campaignId: string): void {
    this.optOutBackers.delete(`${backerEmail.toLowerCase()}:${campaignId}`);
  }

  public isBackerOptedOut(backerEmail: string, campaignId: string): boolean {
    return this.optOutBackers.has(`${backerEmail.toLowerCase()}:${campaignId}`);
  }

  public calculateNewlyCrossedThresholds(
    campaignId: string,
    previousPercentage: number,
    newPercentage: number,
    notifiedAlready: number[] = []
  ): number[] {
    const thresholds = this.getMilestoneThresholds(campaignId);
    return thresholds.filter(
      (th) => previousPercentage < th && newPercentage >= th && !notifiedAlready.includes(th)
    );
  }

  public async dispatchMilestoneEmails(params: {
    campaignId: string;
    campaignName: string;
    creatorEmail: string;
    milestonePercentage: number;
    raisedAmount: string;
    goalAmount: string;
    backers: BackerMilestoneRecipient[];
    baseUrl?: string;
    emailService?: { sendEmail: (args: { to: string; subject: string; html: string }) => Promise<unknown> };
  }): Promise<{ creatorSent: boolean; backersSentCount: number }> {
    const baseUrl = params.baseUrl || "https://stellar.fundable.finance";
    const campaignUrl = `${baseUrl}/campaigns/${encodeURIComponent(params.campaignId)}`;
    const emailer = params.emailService || new EmailService();

    let creatorSent = false;
    let backersSentCount = 0;

    // 1. Send to creator
    if (params.creatorEmail?.trim()) {
      const creatorPayload: MilestoneNotificationEmailPayload = {
        to: params.creatorEmail,
        recipientRole: "creator",
        campaignId: params.campaignId,
        campaignName: params.campaignName,
        milestonePercentage: params.milestonePercentage,
        raisedAmount: params.raisedAmount,
        goalAmount: params.goalAmount,
        campaignUrl,
        optOutUrl: `${baseUrl}/settings/notifications`,
      };

      await emailer.sendEmail({
        to: creatorPayload.to,
        subject: `[Fundable] ${params.campaignName} reached ${params.milestonePercentage}% of goal!`,
        html: buildBrandedMilestoneEmailHtml(creatorPayload),
      });
      creatorSent = true;
    }

    // 2. Filter and send to opted-in backers
    for (const backer of params.backers) {
      if (!backer.email?.trim()) continue;
      if (backer.optedOut || this.isBackerOptedOut(backer.email, params.campaignId)) {
        continue; // Backer opted out
      }

      const backerPayload: MilestoneNotificationEmailPayload = {
        to: backer.email,
        recipientName: backer.name,
        recipientRole: "backer",
        campaignId: params.campaignId,
        campaignName: params.campaignName,
        milestonePercentage: params.milestonePercentage,
        raisedAmount: params.raisedAmount,
        goalAmount: params.goalAmount,
        campaignUrl,
        optOutUrl: `${baseUrl}/campaigns/${encodeURIComponent(params.campaignId)}/opt-out?email=${encodeURIComponent(backer.email)}`,
      };

      await emailer.sendEmail({
        to: backerPayload.to,
        subject: `[Fundable] Backed campaign ${params.campaignName} reached ${params.milestonePercentage}%!`,
        html: buildBrandedMilestoneEmailHtml(backerPayload),
      });
      backersSentCount++;
    }

    return { creatorSent, backersSentCount };
  }
}

export const campaignMilestoneNotificationService = new CampaignMilestoneNotificationService();
