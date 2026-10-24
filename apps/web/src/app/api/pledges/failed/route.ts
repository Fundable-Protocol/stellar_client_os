import { pledgeRetryService } from "@/services/pledge-retry.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    for (const field of ["id", "campaignId", "backerAddress", "amount", "error"]) {
      if (typeof body[field] !== "string" || !body[field]) return Response.json({ error: `${field} is required` }, { status: 400 });
    }
    return Response.json(pledgeRetryService.createFailedPayment({
      id: body.id as string,
      campaignId: body.campaignId as string,
      backerAddress: body.backerAddress as string,
      amount: body.amount as string,
      error: body.error as string,
    }), { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
