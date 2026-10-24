import { getCampaign, getCampaignDataSource } from "@/services/campaign.service";

export const runtime = "nodejs";

const MAX_BODY_LENGTH = 2_000;
const MAX_STEPS_LENGTH = 1_000;

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isSupportedVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "vimeo.com", "www.vimeo.com"].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return Response.json({
    greeting: campaign.pledgeThankYouGreeting ?? "",
    body: campaign.pledgeThankYouBody ?? "",
    imageUrl: campaign.pledgeThankYouImageUrl ?? "",
    videoUrl: campaign.pledgeThankYouVideoUrl ?? "",
    nextSteps: campaign.pledgeThankYouNextSteps ?? "",
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

  try {
    const body = (await request.json()) as {
      creatorAddress?: string;
      greeting?: string;
      body?: string;
      imageUrl?: string;
      videoUrl?: string;
      nextSteps?: string;
    };
    if (!body.creatorAddress || body.creatorAddress.trim().toLowerCase() !== campaign.creator.trim().toLowerCase()) {
      return Response.json({ error: "Only the campaign creator can edit the thank-you page" }, { status: 403 });
    }
    if (
      typeof body.greeting !== "string" || body.greeting.length > 240 ||
      typeof body.body !== "string" || body.body.length > MAX_BODY_LENGTH ||
      typeof body.nextSteps !== "string" || body.nextSteps.length > MAX_STEPS_LENGTH
    ) {
      return Response.json({ error: "Greeting, message, or next steps exceed the allowed length" }, { status: 400 });
    }
    if (body.imageUrl && !isHttpsUrl(body.imageUrl)) {
      return Response.json({ error: "Image URL must use HTTPS" }, { status: 400 });
    }
    if (body.videoUrl && !isSupportedVideoUrl(body.videoUrl)) {
      return Response.json({ error: "Video URL must be an HTTPS YouTube or Vimeo link" }, { status: 400 });
    }

    const updated = await getCampaignDataSource().saveCampaign({
      ...campaign,
      pledgeThankYouGreeting: body.greeting.trim(),
      pledgeThankYouBody: body.body,
      pledgeThankYouImageUrl: body.imageUrl?.trim() || undefined,
      pledgeThankYouVideoUrl: body.videoUrl?.trim() || undefined,
      pledgeThankYouNextSteps: body.nextSteps,
      updatedAt: Date.now(),
    });
    return Response.json({
      greeting: updated.pledgeThankYouGreeting ?? "",
      body: updated.pledgeThankYouBody ?? "",
      imageUrl: updated.pledgeThankYouImageUrl ?? "",
      videoUrl: updated.pledgeThankYouVideoUrl ?? "",
      nextSteps: updated.pledgeThankYouNextSteps ?? "",
    });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}
