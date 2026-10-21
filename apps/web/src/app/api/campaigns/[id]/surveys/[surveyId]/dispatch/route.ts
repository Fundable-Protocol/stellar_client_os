import { NextRequest, NextResponse } from "next/server";
import { campaignSurveyService } from "@/services/campaign-survey.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * POST /api/campaigns/:id/surveys/:surveyId/dispatch
 * Distributes survey invitations via email with in-app notification fallback.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> }
) {
  const { id, surveyId } = await params;
  try {
    const body = (await request.json()) as {
      creatorAddress?: string;
      subject?: string;
      message?: string;
    };

    if (!body.creatorAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: "creatorAddress is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    const result = await campaignSurveyService.sendSurveyToBackers({
      campaignId: id,
      surveyId,
      creatorAddress: body.creatorAddress,
      subject: body.subject,
      message: body.message,
    });

    return NextResponse.json({ success: true, ...result }, { status: 200, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to dispatch survey" },
      { status: 400, headers: NO_STORE }
    );
  }
}
