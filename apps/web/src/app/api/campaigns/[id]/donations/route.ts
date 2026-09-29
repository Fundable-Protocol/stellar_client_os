import { donationService, DonationErrorCode } from "@/services/campaign-donation.service";

export const runtime = "nodejs";

/** Map donation validation failures onto HTTP status codes. */
function statusForCode(code: DonationErrorCode): number {
  switch (code) {
    case "INVALID_CAMPAIGN":
      return 404;
    case "CAMPAIGN_NOT_ACCEPTING":
      return 409;
    default:
      return 400;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await donationService.donate({
    campaignId: id,
    donorAddress: String(body.donorAddress ?? ""),
    amount: (body.amount ?? "") as string | number,
    token: body.token as string | undefined,
    message: body.message as string | undefined,
    anonymous: body.anonymous as boolean | undefined,
    txHash: body.txHash as string | undefined,
    idempotencyKey: body.idempotencyKey as string | undefined,
  });

  if (!result.ok) {
    return Response.json({ error: result.error, code: result.code }, { status: statusForCode(result.code) });
  }

  return Response.json(
    {
      donation: result.donation,
      receipt: result.receipt,
      campaign: {
        id: result.campaign.id,
        name: result.campaign.name,
        raisedAmount: result.campaign.raisedAmount,
        goalAmount: result.campaign.goalAmount,
      },
      milestones: result.milestones,
    },
    { status: 201 },
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json(donationService.getSummary(id));
}
