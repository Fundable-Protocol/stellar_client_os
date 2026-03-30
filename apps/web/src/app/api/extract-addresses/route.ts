import { NextRequest, NextResponse } from "next/server";

const STELLAR_ADDRESS_RE = /\b([GC][A-Z2-7]{55})\b/g;

/** Parse a tweet ID from an X/Twitter URL */
function parseTweetId(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/\/status\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/extract-addresses
 *
 * Fetches replies to an X (Twitter) post and extracts Stellar addresses from the text.
 *
 * @param req - Incoming request with a `url` query param pointing to an X post
 * @returns JSON `{ addresses: string[] }` or an error response
 */
export async function GET(req: NextRequest) {
  const tweetUrl = req.nextUrl.searchParams.get("url");
  if (!tweetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const tweetId = parseTweetId(tweetUrl);
  if (!tweetId) {
    return NextResponse.json({ error: "Invalid X post URL" }, { status: 400 });
  }

  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    return NextResponse.json({ error: "X API not configured" }, { status: 503 });
  }

  // Fetch up to 100 replies per page, max 5 pages (500 replies)
  const addresses = new Set<string>();
  let nextToken: string | undefined;
  let pages = 0;

  try {
    do {
      const params = new URLSearchParams({
        query: `conversation_id:${tweetId} is:reply`,
        max_results: "100",
        "tweet.fields": "text",
      });
      if (nextToken) params.set("next_token", nextToken);

      const res = await fetch(
        `https://api.twitter.com/2/tweets/search/recent?${params}`,
        { headers: { Authorization: `Bearer ${bearerToken}` } }
      );

      if (res.status === 429) {
        return NextResponse.json({ error: "X API rate limit reached. Try again later." }, { status: 429 });
      }
      if (!res.ok) {
        const body = await res.text();
        return NextResponse.json({ error: `X API error: ${res.status} ${body}` }, { status: 502 });
      }

      const data = await res.json();
      for (const tweet of data.data ?? []) {
        for (const match of (tweet.text ?? '').matchAll(STELLAR_ADDRESS_RE)) {
          addresses.add(match[1]);
        }
      }

      nextToken = data.meta?.next_token;
      pages++;
    } while (nextToken && pages < 5);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch replies" },
      { status: 502 }
    );
  }

  return NextResponse.json({ addresses: Array.from(addresses) });
}
