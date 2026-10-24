import { multisigErrorResponse, readJsonBody, str } from "@/lib/multisig-http";
import { campaignMultisigWithdrawalService as svc } from "@/services/campaign-multisig-withdrawal.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST .../withdrawals/:requestId/release — creator releases a fully co-signed withdrawal. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const { id, requestId } = await params;
    const body = await readJsonBody(request);
    const existing = svc.getRequest(requestId);
    if (!existing || existing.campaignId !== id) {
      return Response.json({ error: "Withdrawal request not found" }, { status: 404 });
    }
    return Response.json({ request: svc.release(requestId, str(body.callerAddress)) });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}
