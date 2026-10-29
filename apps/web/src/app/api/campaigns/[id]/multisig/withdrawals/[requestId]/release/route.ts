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

    const callerAddress = str(body.callerAddress);

    // Enforce 2FA for creator accounts with 2FA enabled before releasing funds.
    const twoFactor = await svc.verifyTwoFactorForRelease(callerAddress, body.twoFactor);
    if (!twoFactor.ok) {
      return Response.json(
        { error: twoFactor.error, twoFactorRequired: true },
        { status: twoFactor.status },
      );
    }

    return Response.json({ request: svc.release(requestId, callerAddress) });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}
