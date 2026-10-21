import { MultisigError } from "@/services/campaign-multisig-withdrawal.service";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** Maps multi-sig service errors onto HTTP responses. */
export function multisigErrorResponse(error: unknown): Response {
  if (error instanceof MultisigError) {
    const status =
      error.code === "CAMPAIGN_NOT_FOUND" || error.code === "REQUEST_NOT_FOUND"
        ? 404
        : error.code === "NOT_AUTHORIZED"
          ? 403
          : error.code === "INVALID_STATE" || error.code === "SETUP_REQUIRED" || error.code === "NOT_QUALIFYING"
            ? 409
            : 400;
    return Response.json({ error: error.message, code: error.code }, { status, headers: NO_STORE });
  }
  return Response.json({ error: "Multi-sig operation failed" }, { status: 500, headers: NO_STORE });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new MultisigError("INVALID_INPUT", "Invalid JSON body");
  }
}

export const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
