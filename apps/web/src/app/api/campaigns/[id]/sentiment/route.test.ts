import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import {
  setSentimentDataSource,
  InMemorySentimentDataSource,
} from "@/services/campaign-sentiment.service";

const BASE = "https://app.test/api/campaigns/c1/sentiment";

function post(body: unknown): Request {
  return new Request(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => setSentimentDataSource(new InMemorySentimentDataSource()));

describe("POST /api/campaigns/[id]/sentiment", () => {
  it("analyzes and stores feedback", async () => {
    const res = await POST(
      post({
        feedback: [
          { id: "1", comment: "amazing project" },
          { id: "2", comment: "love the impact" },
        ],
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.campaignId).toBe("c1");
    expect(body.sentiment.total).toBe(2);
    expect(body.sentiment.counts.positive).toBe(2);
  });

  it("400s on missing feedback array", async () => {
    const res = await POST(post({ feedback: [] }), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(
      new Request(BASE, { method: "POST", body: "{bad" }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("ignores out-of-range ratings", async () => {
    const res = await POST(
      post({ feedback: [{ id: "1", comment: "neutral text", rating: 99 }] }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const body = await res.json();
    expect(body.sentiment.comments[0].rating).toBeUndefined();
  });
});

describe("GET /api/campaigns/[id]/sentiment", () => {
  it("returns stored analysis", async () => {
    await POST(
      post({ feedback: [{ id: "1", comment: "wonderful" }] }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const res = await GET(new Request(BASE), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect((await res.json()).campaignId).toBe("c1");
  });

  it("sets the flagged header for low-sentiment campaigns", async () => {
    await POST(
      post({
        feedback: [
          { id: "1", comment: "terrible communication, totally ghosted" },
          { id: "2", comment: "stalled for months, very frustrating" },
          { id: "3", comment: "disappointed, I regret this sponsorship" },
          { id: "4", comment: "awful updates, feels like a scam" },
        ],
      }),
      { params: Promise.resolve({ id: "c1" }) },
    );
    const res = await GET(new Request(BASE), { params: Promise.resolve({ id: "c1" }) });
    expect(res.headers.get("X-Sentiment-Flagged")).toBe("true");
  });

  it("404s for unanalyzed campaigns", async () => {
    const res = await GET(new Request(BASE), { params: Promise.resolve({ id: "ghost" }) });
    expect(res.status).toBe(404);
  });
});
