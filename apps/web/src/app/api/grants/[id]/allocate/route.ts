import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGrantProgramService } from "@/services/grant-program.service";

const AllocateSchema = z.object({
  campaignId: z.string().min(1),
  baseContribution: z.string().min(1),
  allocatedBy: z.string().min(1),
});

/**
 * POST /api/grants/:id/allocate
 *
 * Allocates a grant match for a campaign contribution. Matching funds come
 * from the platform-funded pool reserved for underrepresented creators and
 * currently match the first 10% of a campaign's funds (see program config).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = AllocateSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid allocation payload", details: body.error.flatten() },
        { status: 400 },
      );
    }
    const allocation = await getGrantProgramService().computeMatch(
      id,
      body.data.campaignId,
      body.data.baseContribution,
      body.data.allocatedBy,
    );
    return NextResponse.json({ success: true, data: allocation }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to allocate grant match";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}