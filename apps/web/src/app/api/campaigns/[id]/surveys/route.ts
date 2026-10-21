import { NextRequest, NextResponse } from "next/server";
import { campaignSurveyService } from "@/services/campaign-survey.service";
import { CreateSurveyInput } from "@/types/campaign-survey";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET  /api/campaigns/:id/surveys           List surveys for campaign
 * POST /api/campaigns/:id/surveys           Create new survey (creator only)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const surveys = await campaignSurveyService.getSurveysForCampaign(id);
    return NextResponse.json({ success: true, surveys }, { headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to fetch surveys" },
      { status: 500, headers: NO_STORE }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      creatorAddress?: string;
      title?: string;
      description?: string;
      questions?: CreateSurveyInput["questions"];
    };

    if (!body.creatorAddress?.trim()) {
      return NextResponse.json(
        { success: false, error: "creatorAddress is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!body.title?.trim()) {
      return NextResponse.json(
        { success: false, error: "title is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    if (!body.questions || !Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one question is required" },
        { status: 400, headers: NO_STORE }
      );
    }

    const survey = await campaignSurveyService.createSurvey(
      {
        campaignId: id,
        title: body.title,
        description: body.description,
        questions: body.questions,
      },
      body.creatorAddress
    );

    return NextResponse.json({ success: true, survey }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to create survey" },
      { status: 400, headers: NO_STORE }
    );
  }
}
