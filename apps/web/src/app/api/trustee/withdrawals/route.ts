import { multisigErrorResponse, readJsonBody, str } from "@/lib/multisig-http";
import { campaignMultisigWithdrawalService as svc } from "@/services/campaign-multisig-withdrawal.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/trustee/withdrawals?trustee=G...&all=1 — withdrawals awaiting the trustee. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const data = svc.listForTrustee(url.searchParams.get("trustee") ?? "", url.searchParams.get("all") === "1");
    return Response.json({ data, count: data.length });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}

/** POST /api/trustee/withdrawals — body `{ requestId, trustee, action: "cosign" | "reject" }`. */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const requestId = str(body.requestId) ?? "";
    const trustee = str(body.trustee);
    if (body.action === "cosign") return Response.json({ request: svc.coSign(requestId, trustee) });
    if (body.action === "reject") return Response.json({ request: svc.reject(requestId, trustee) });
    return Response.json({ error: 'action must be "cosign" or "reject"' }, { status: 400 });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}
