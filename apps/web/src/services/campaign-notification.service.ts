import type { SendEmailOptions } from "./email.service";

export const NOTIFICATION_FREQUENCIES = ["daily", "weekly", "monthly", "milestones"] as const;
export type CampaignNotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];
export type CampaignNotificationChannel = "email" | "push";

export interface CampaignNotificationPreference {
  recipientId: string;
  email?: string;
  pushToken?: string;
  channels: CampaignNotificationChannel[];
  frequency: CampaignNotificationFrequency;
  lastNotifiedAt?: number;
}

export interface PushNotification {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export interface CampaignPushNotifier {
  sendPush(notification: PushNotification): Promise<boolean>;
}

export interface CampaignNotificationDispatch {
  emails: SendEmailOptions[];
  pushes: PushNotification[];
  updatedPreferences: CampaignNotificationPreference[];
}

const FREQUENCY_WINDOWS: Record<Exclude<CampaignNotificationFrequency, "milestones">, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export function isNotificationDue(
  preference: CampaignNotificationPreference,
  now: number,
  hasMilestone: boolean,
): boolean {
  if (preference.frequency === "milestones") return hasMilestone;
  return preference.lastNotifiedAt === undefined || now - preference.lastNotifiedAt >= FREQUENCY_WINDOWS[preference.frequency];
}

export function buildCampaignNotificationDispatch(
  campaign: { id: string; name: string; raisedAmount: string; goalAmount: string },
  milestones: number[],
  preferences: CampaignNotificationPreference[],
  now: number,
): CampaignNotificationDispatch {
  const milestone = milestones.at(-1);
  const progress = `${campaign.raisedAmount}/${campaign.goalAmount}`;
  const title = milestone ? `${campaign.name} reached ${milestone}%` : `${campaign.name} progress update`;
  const body = milestone
    ? `${campaign.name} reached ${milestone}% of its funding goal.`
    : `${campaign.name} is now at ${progress}.`;
  const emails: SendEmailOptions[] = [];
  const pushes: PushNotification[] = [];
  const updatedPreferences = preferences.map((preference) => {
    if (!isNotificationDue(preference, now, milestones.length > 0)) return preference;
    if (preference.channels.includes("email") && preference.email) {
      emails.push({
        to: preference.email,
        subject: title,
        html: `<h2>${campaign.name}</h2><p>${body}</p><p><a href="/campaigns/${campaign.id}">View campaign progress</a></p>`,
      });
    }
    if (preference.channels.includes("push") && preference.pushToken) {
      pushes.push({
        token: preference.pushToken,
        title,
        body,
        data: { campaignId: campaign.id, ...(milestone ? { milestone: String(milestone) } : {}) },
      });
    }
    return { ...preference, lastNotifiedAt: now };
  });
  return { emails, pushes, updatedPreferences };
}
