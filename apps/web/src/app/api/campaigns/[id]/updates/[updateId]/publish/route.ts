import { NextRequest, NextResponse } from "next/server";
import { getCampaignUpdate } from "@/services/campaign-update.service";
import {
  publishCampaignUpdateWithNotifications,
  resolveUpdateRecipients,
  type BackerRecipient,
} from "@/services/campaign-update-publish.service";
import { EmailService } from "@/services/email.service";
import { authorizeCampaignCreator } from "@/lib/campaign-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const emailService = new EmailService();

/**
 * POST /api/campaigns/[id]/updates/[updateId]/publish
 *
 * Publish a draft update and notify the campaign's backers.
 *
 * Backers receive an instant email or a digest, depending on the preference
 * stored for them; backers without a preference fall back to the mode set on
 * the update itself. A copy of the update is also stored as an in-app
 * notification for every backer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; updateId: string }> },
) {
  const { id, updateId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const creatorAddress = (body.creatorAddress ?? body.actor ?? "").trim();

    const authorization = await authorizeCampaignCreator(id, creatorAddress);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.error },
        { status: authorization.status },
      );
    }

    const existing = await getCampaignUpdate(updateId);
    if (!existing || existing.campaignId !== id) {
      return NextResponse.json({ success: false, error: "Update not found" }, { status: 404 });
    }

    const backers = await resolveUpdateRecipients(
      id,
      Array.isArray(body.backers) ? (body.backers as BackerRecipient[]) : [],
    );

    const { update, report } = await publishCampaignUpdateWithNotifications({
      updateId,
      campaign: {
        id,
        name: body.campaignTitle ?? existing.title ?? "your campaign",
      },
      backers,
      emailSender: emailService,
      origin: body.origin ?? process.env.NEXT_PUBLIC_APP_ORIGIN,
    });

    return NextResponse.json({ success: true, update, report });
  } catch (error) {
    console.error("Error publishing campaign update:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to publish update" },
      { status: 500 },
    );
  }
}
