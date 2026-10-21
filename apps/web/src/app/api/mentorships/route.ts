export const runtime = "nodejs";

import { getMentor, listMentorships, requestMentorship } from "@/services/mentorship.service";

/** GET /api/mentorships?address= — mentorships (with mentor profile) for a creator or mentor. */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address) return Response.json({ error: "address is required" }, { status: 400 });
  const mentorships = listMentorships(address).map((m) => ({ ...m, mentor: getMentor(m.mentorAddress) }));
  return Response.json({ mentorships }, { headers: { "Cache-Control": "private, no-store" } });
}

/** POST /api/mentorships — body `{ creatorAddress, mentorAddress, category }`. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { creatorAddress?: string; mentorAddress?: string; category?: string };
    const result = requestMentorship(body.creatorAddress ?? "", body.mentorAddress ?? "", body.category ?? "");
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ mentorship: result.value }, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}
