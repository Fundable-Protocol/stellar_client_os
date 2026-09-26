import { getCampaign, getCampaignDataSource, type CampaignRecord } from "@/services/campaign.service";
import { NOTIFICATION_FREQUENCIES, type CampaignNotificationChannel, type CampaignNotificationPreference } from "@/services/campaign-notification.service";

export const runtime = "nodejs";
const CHANNELS: CampaignNotificationChannel[] = ["email", "push"];

function isPreference(value: unknown): value is CampaignNotificationPreference {
  if (!value || typeof value !== "object") return false;
  const preference = value as Partial<CampaignNotificationPreference>;
  return typeof preference.recipientId === "string"
    && NOTIFICATION_FREQUENCIES.includes(preference.frequency as CampaignNotificationPreference["frequency"])
    && Array.isArray(preference.channels)
    && preference.channels.length > 0
    && preference.channels.every((channel) => CHANNELS.includes(channel as CampaignNotificationChannel))
    && (!preference.email || typeof preference.email === "string")
    && (!preference.pushToken || typeof preference.pushToken === "string");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return Response.json({ preferences: campaign.notificationPreferences ?? [] });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const body = (await request.json()) as { preference?: unknown };
  if (!isPreference(body.preference)) {
    return Response.json({ error: "Invalid notification preference" }, { status: 400 });
  }
  const preference = body.preference;
  const preferences = (campaign.notificationPreferences ?? []).filter(
    (existing) => existing.recipientId !== preference.recipientId,
  );
  const updated: CampaignRecord = {
    ...campaign,
    notificationPreferences: [...preferences, preference],
    updatedAt: Date.now(),
  };
  await getCampaignDataSource().saveCampaign(updated);
  return Response.json({ preference });
}
