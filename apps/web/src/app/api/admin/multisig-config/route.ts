import { authorizeAdminRequest } from "@/lib/admin-auth";
import { multisigErrorResponse, readJsonBody } from "@/lib/multisig-http";
import { campaignMultisigWithdrawalService as svc } from "@/services/campaign-multisig-withdrawal.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** GET /api/admin/multisig-config — current threshold and trustee registry. */
export async function GET(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;
  return Response.json(svc.getConfig(), { headers: NO_STORE });
}

/** PUT /api/admin/multisig-config — body `{ threshold?: string, trustees?: string[] }`. */
export async function PUT(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;
  try {
    const body = await readJsonBody(request);
    if (body.threshold === undefined && body.trustees === undefined) {
      return Response.json({ error: "threshold or trustees is required" }, { status: 400, headers: NO_STORE });
    }
    if (body.threshold !== undefined) svc.setThreshold(body.threshold);
    if (body.trustees !== undefined) svc.setTrustees(body.trustees);
    return Response.json(svc.getConfig(), { headers: NO_STORE });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}
