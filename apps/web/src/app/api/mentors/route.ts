export const runtime = "nodejs";

import { matchMentors, saveMentorProfile } from "@/services/mentorship.service";

/** GET /api/mentors?category=&tags=a,b — ranked verified mentors for a campaign category. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? "";
  const tags = (url.searchParams.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return Response.json({ matches: matchMentors(category, tags) }, { headers: { "Cache-Control": "private, no-store" } });
}

/** POST /api/mentors — create/update a mentor profile (verification is admin-only). */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = saveMentorProfile(body ?? {});
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ mentor: result.value }, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}
