import { multisigErrorResponse, readJsonBody, str } from "@/lib/multisig-http";
import { campaignMultisigWithdrawalService as svc } from "@/services/campaign-multisig-withdrawal.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/campaigns/:id/multisig — qualification and setup status (wizard data). */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const status = await svc.checkQualification((await params).id);
    return Response.json({ ...status, trustees: svc.getConfig().trustees });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}

/** POST /api/campaigns/:id/multisig — body `{ callerAddress, trustee }`. */
export async function POST(request: Request, { params }: Ctx) {
  try {
    const body = await readJsonBody(request);
    const setup = await svc.setupMultisig({
      campaignId: (await params).id,
      callerAddress: str(body.callerAddress),
      trustee: str(body.trustee),
    });
    return Response.json({ setup }, { status: 201 });
  } catch (error) {
    return multisigErrorResponse(error);
  }
}
