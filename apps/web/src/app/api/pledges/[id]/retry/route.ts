import { pledgeRetryService } from "@/services/pledge-retry.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payment = pledgeRetryService.get((await params).id);
  if (!payment) return Response.json({ error: "Pledge payment not found" }, { status: 404 });
  return Response.json(payment, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as { ok?: unknown; error?: unknown };
    if (typeof body.ok !== "boolean") return Response.json({ error: "ok must be a boolean" }, { status: 400 });
    return Response.json(pledgeRetryService.retry((await params).id, { ok: body.ok, error: typeof body.error === "string" ? body.error : undefined }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not retry pledge" }, { status: 400 });
  }
}
