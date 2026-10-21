import { pledgeRetryService } from "@/services/pledge-retry.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) return Response.json({ error: "address is required" }, { status: 400 });
  return Response.json({ data: pledgeRetryService.notificationsFor(address) }, { headers: { "Cache-Control": "private, no-store" } });
}
