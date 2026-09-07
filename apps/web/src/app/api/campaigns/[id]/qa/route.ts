import { detectSpam } from "@/lib/spam-detection";
import type { QAItem, CreateQAItemInput } from "@/types/qa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

/** In-memory store – replace with DB in production */
const qaStore: Map<string, QAItem[]> = new Map();

function getQaItems(campaignId: string): QAItem[] {
  return qaStore.get(campaignId) ?? [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const campaignId = (await params).id;
  const items = getQaItems(campaignId);
  return noStore({ items, total: items.length });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const campaignId = (await params).id;

  try {
    const body = (await request.json()) as CreateQAItemInput;

    if (!body.content?.trim()) {
      return noStore({ error: "Content is required" }, { status: 400 });
    }
    if (!body.authorAddress?.trim()) {
      return noStore({ error: "Author address is required" }, { status: 400 });
    }

    // Run spam detection
    const verdict = detectSpam(body.content, false);

    const newItem: QAItem = {
      id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      campaignId,
      authorAddress: body.authorAddress,
      authorName: body.authorName,
      isVerifiedBacker: false,
      content: body.content,
      createdAt: Date.now(),
      status: verdict.action === "hide" ? "hidden" : verdict.action === "flag" ? "flagged" : "visible",
      spamVerdict: verdict,
      replyToId: body.replyToId,
      upvotes: 0,
    };

    const items = getQaItems(campaignId);
    items.unshift(newItem);
    qaStore.set(campaignId, items);

    return noStore({ item: newItem, moderation: { action: verdict.action, score: verdict.score } });
  } catch (error) {
    return noStore(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 },
    );
  }
}
