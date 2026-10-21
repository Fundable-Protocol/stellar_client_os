import { NextRequest, NextResponse } from "next/server";
import { campaignSurveyService } from "@/services/campaign-survey.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET   /api/campaigns/:id/surveys/:surveyId           Get survey by ID
 * PATCH /api/campaigns/:id/surveys/:surveyId           Close survey (creator only)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> }
) {
  const { surveyId } = await params;
  try {
    const survey = await campaignSurveyService.getSurveyById(surveyId);
    if (!survey) {
      return NextResponse.json({ success: false, error: "Survey not found" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ success: true, survey }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to fetch survey" },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> }
) {
  const { surveyId } = await params;
  try {
    const body = (await request.json()) as { creatorAddress?: string; action?: string };
    if (!body.creatorAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: "creatorAddress is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    if (body.action === "close") {
      const survey = await campaignSurveyService.closeSurvey(surveyId, body.creatorAddress);
      return NextResponse.json({ success: true, survey }, { headers: NO_STORE });
    }

    return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update survey" },
      { status: 400, headers: NO_STORE }
    );
  }
}
