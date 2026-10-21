import { authorizeAdminRequest } from "@/lib/admin-auth";
import { backerBadgeService, type BackerBadgeDefinition } from "@/services/backer-badge.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;
  return Response.json({ data: backerBadgeService.listDefinitions() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;
  try {
    const body = await request.json() as { definitions?: BackerBadgeDefinition[] };
    if (!Array.isArray(body.definitions)) return Response.json({ error: "definitions must be an array" }, { status: 400 });
    return Response.json({ data: backerBadgeService.configureDefinitions(body.definitions) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid badge definitions" }, { status: 400 });
  }
}
