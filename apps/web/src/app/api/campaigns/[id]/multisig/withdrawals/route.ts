import { multisigErrorResponse, readJsonBody, str } from "@/lib/multisig-http";
import { campaignMultisigWithdrawalService as svc } from "@/services/campaign-multisig-withdrawal.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/campaigns/:id/multisig/withdrawals — list withdrawal requests. */
export async function GET(_request: Request, { params }: Ctx) {
  const id = (await params).id;
  return Response.json({ data: svc.listCampaignRequests(id) });
}

/** POST /api/campaigns/:id/multisig/withdrawals — creator opens (and signs) a request. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const body = await readJsonBody(request);
    const created = await svc.requestWithdrawal({
      campaignId: (await params).id,
      callerAddress: str(body.callerAddress),
      amount: str(body.amount),
      destination: str(body.destination),
      transactionXdr: str(body.transactionXdr),
    });
    return Response.json({ request: created }, { status: 201 });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}
