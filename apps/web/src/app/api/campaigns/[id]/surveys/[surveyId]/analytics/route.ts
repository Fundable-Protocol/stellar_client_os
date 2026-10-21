import { NextRequest, NextResponse } from "next/server";
import { campaignSurveyService } from "@/services/campaign-survey.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET /api/campaigns/:id/surveys/:surveyId/analytics
 * Returns aggregate metrics for charts (ratings breakdown, choice distribution, text responses).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> }
) {
  const { surveyId } = await params;
  try {
    const analytics = await campaignSurveyService.getSurveyAnalytics(surveyId);
    return NextResponse.json({ success: true, analytics }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to fetch survey analytics" },
      { status: 500, headers: NO_STORE }
    );
  }
}
