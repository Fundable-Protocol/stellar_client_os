import {
  getPreferences,
  getPreferencesForCampaign,
  PreferencesValidationError,
  setPreferences,
} from "@/services/notification-preferences.service";

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
 * GET /api/campaigns/[id]/notifications?sponsorId=G…
 * One sponsor's preferences, or all preferences for the campaign.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
