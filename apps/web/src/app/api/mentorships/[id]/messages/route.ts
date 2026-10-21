export const runtime = "nodejs";

import { listMessages, sendMessage } from "@/services/mentorship.service";

/** GET /api/mentorships/:id/messages?viewer= */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = new URL(request.url).searchParams.get("viewer") ?? "";
  const result = listMessages(id, viewer);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ messages: result.value }, { headers: { "Cache-Control": "private, no-store" } });
}

/** POST /api/mentorships/:id/messages — body `{ senderAddress, text }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { senderAddress?: string; text?: string };
    const result = sendMessage(id, body.senderAddress ?? "", body.text ?? "");
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ message: result.value }, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}
