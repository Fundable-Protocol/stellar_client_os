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
import {
  getPreferences,
  getPreferencesForCampaign,
  PreferencesValidationError,
  setPreferences,
} from "@/services/notification-preferences.service";
import {
  getCampaign,
  getCampaignMilestones,
  sendCampaignMilestoneNotifications,
} from "@/services/campaign-notifications.service";

export const runtime = "nodejs";

/**
 * POST /api/campaigns/[id]/notifications
 * Body: `{ sponsorId, frequency, channel, email?, pushEndpoint? }`
 * Creates or updates a sponsor's notification preferences.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const prefs = await setPreferences({
      campaignId: id,
      sponsorId: String(body.sponsorId ?? ""),
      frequency: body.frequency as never,
      channel: body.channel as never,
      email: body.email === undefined ? undefined : String(body.email),
      pushEndpoint: body.pushEndpoint === undefined ? undefined : String(body.pushEndpoint),
    });
    return Response.json(prefs, { status: 201 });
  } catch (error) {
    if (error instanceof PreferencesValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "internal error saving preferences" }, { status: 500 });
  }
}

/**
 * GET /api/campaigns/[id]/notifications?sponsorId=GΩ
 * One sponsor's preferences, or all preferences for the campaign.
 */
export async function GET(
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
  const sponsorId = new URL(request.url).searchParams.get("sponsorId");

  if (sponsorId) {
    const prefs = await getPreferences(id, sponsorId);
    if (!prefs) {
      return Response.json({ error: "no preferences found for this sponsor" }, { status: 404 });
    }
    return Response.json(prefs);
  }

  const all = await getPreferencesForCampaign(id);
  return Response.json({ campaignId: id, preferences: all });
}

/**
 * PUT /api/campaigns/[id]/notifications
 * Body: `{ milestone }`
 * Sends push notifications to all subscribed sponsors when a sponsored campaign
 * reaches a milestone: trees planted, verification complete, campaign finished,
 * impact achieved.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const milestone = String(body.milestone ?? "");
  if (!milestone) {
    return Response.json({ error: "milestone is required" }, { status: 400 });
  }

  const campaign = await getCampaign(id);
  if (!campaign) {
    return Response.json({ error: "campaign not found" }, { status: 404 });
  }

  const milestones = await getCampaignMilestones(id);
  if (!milestones.includes(milestone)) {
    return Response.json(
      { error: `unknown milestone: ${milestone}`, available: milestones },
      { status: 400 },
    );
  }

  try {
    const result = await sendCampaignMilestoneNotifications({
      campaignId: id,
      milestone,
    });
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PreferencesValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "internal error sending notifications" }, { status: 500 });
  }
}
