export const runtime = "nodejs";

import { authorizeAdminRequest } from "@/lib/admin-auth";
import { setMentorVerified } from "@/services/mentorship.service";

/** POST /api/mentors/:address/verify — admin-only; body `{ verified?: boolean }` (default true). */
export async function POST(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const denied = authorizeAdminRequest(request);
  if (denied) return denied;
  const { address } = await params;
  const body = (await request.json().catch(() => ({}))) as { verified?: boolean };
  const result = setMentorVerified(address, body.verified ?? true);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ mentor: result.value });
}
