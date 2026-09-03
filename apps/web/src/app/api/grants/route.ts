import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getGrantProgramService,
  UNDERREPRESENTED_CRITERIA,
} from "@/services/grant-program.service";

const criteriaTuple = UNDERREPRESENTED_CRITERIA as unknown as [string, ...string[]];

const CreateProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  matchPercentage: z.number().int().min(1).max(50).optional(),
  perCampaignCap: z.string().optional(),
  totalPool: z.string().min(1),
  eligibilityCriteria: z.array(z.enum(criteriaTuple)).min(1),
});

/**
 * GET /api/grants
 *
 * Lists every platform-funded creator grant program.
 */
export async function GET() {
  try {
    const data = await getGrantProgramService().listPrograms();
    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load grant programs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/grants
 *
 * Creates a grant matching program funded by platform profits.
 */
export async function POST(request: NextRequest) {
  try {
    const body = CreateProgramSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid grant program payload", details: body.error.flatten() },
        { status: 400 },
      );
    }
    const program = await getGrantProgramService().createProgram(body.data);
    return NextResponse.json({ success: true, data: program }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create grant program";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}