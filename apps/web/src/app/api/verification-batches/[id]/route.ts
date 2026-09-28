import {
  BatchConflictError,
  BatchNotFoundError,
  BatchValidationError,
  getBatch,
  getBatchTrees,
  rejectBatch,
  verifyBatch,
} from "@/services/batch-verification.service";

export const runtime = "nodejs";

/**
 * GET /api/verification-batches/[id] — fetch one batch.
 * Pass `?include=trees` to expand the deterministic per-tree geo placements.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const batch = await getBatch((await params).id);
  if (!batch) return Response.json({ error: "batch not found" }, { status: 404 });

  const includeTrees = new URL(request.url).searchParams.get("include") === "trees";
  return Response.json(includeTrees ? { ...batch, trees: getBatchTrees(batch) } : batch);
}

/**
 * PATCH /api/verification-batches/[id] — resolve a pending batch.
 *
 * Body: `{ action: "verify", verifier }` or
 *       `{ action: "reject", verifier, reason }`.
 *
 * | Status | Meaning                                        |
 * |--------|------------------------------------------------|
 * | 200    | Batch updated                                  |
 * | 400    | Validation error (missing fields, bad action)  |
 * | 404    | Unknown batch id                               |
 * | 409    | Batch already resolved / conflict              |
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;

  let body: { action?: string; verifier?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const verifier = String(body.verifier ?? "");
  if (!verifier) {
    return Response.json({ error: "verifier is required" }, { status: 400 });
  }

  try {
    if (body.action === "verify") {
      return Response.json(await verifyBatch(id, verifier));
    }
    if (body.action === "reject") {
      return Response.json(await rejectBatch(id, verifier, String(body.reason ?? "")));
    }
    return Response.json({ error: `unknown action: ${String(body.action)}` }, { status: 400 });
  } catch (error) {
    if (error instanceof BatchNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof BatchConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BatchValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "internal error resolving batch" }, { status: 500 });
  }
}
