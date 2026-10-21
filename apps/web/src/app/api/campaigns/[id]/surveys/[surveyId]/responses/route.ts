import { NextRequest, NextResponse } from "next/server";
import { campaignSurveyService } from "@/services/campaign-survey.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET  /api/campaigns/:id/surveys/:surveyId/responses?backer=G...
 * POST /api/campaigns/:id/surveys/:surveyId/responses
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> }
) {
  const { surveyId } = await params;
  const backer = request.nextUrl.searchParams.get("backer");

  if (backer) {
    const hasResponded = campaignSurveyService.hasBackerResponded(surveyId, backer);
    return NextResponse.json({ success: true, hasResponded }, { headers: NO_STORE });
  }

  const responses = campaignSurveyService.getResponsesForSurvey(surveyId);
  return NextResponse.json({ success: true, responses }, { headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> }
) {
  const { surveyId } = await params;
  try {
    const body = (await request.json()) as {
      backerAddress?: string;
      answers?: Array<{ questionId: string; value: string | number }>;
    };

    if (!body.backerAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: "backerAddress is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!body.answers || !Array.isArray(body.answers)) {
      return NextResponse.json(
        { success: false, error: "answers array is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    const response = await campaignSurveyService.submitResponse({
      surveyId,
      backerAddress: body.backerAddress,
      answers: body.answers,
    });

    return NextResponse.json({ success: true, response }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to submit response" },
      { status: 400, headers: NO_STORE }
    );
  }
}
