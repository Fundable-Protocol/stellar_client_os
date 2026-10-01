import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGrantProgramService } from "@/services/grant-program.service";

const StatusSchema = z.object({
  status: z.enum(["OPEN", "PAUSED", "CLOSED"]),
});

/**
 * GET /api/grants/:id
 *
 * Returns a single grant matching program.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const program = await getGrantProgramService().getProgram(id);
  if (!program) {
    return NextResponse.json({ error: "Grant program not found" }, { status: 404 });
  }
  return NextResponse.json({ data: program });
}

/**
 * PATCH /api/grants/:id
 *
 * Updates the lifecycle status of a grant program (open/paused/closed).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = StatusSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "status must be OPEN, PAUSED, or CLOSED", details: body.error.flatten() },
        { status: 400 },
      );
    }
    const program = await getGrantProgramService().setProgramStatus(id, body.data.status);
    if (!program) {
      return NextResponse.json({ error: "Grant program not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: program });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update grant program";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}