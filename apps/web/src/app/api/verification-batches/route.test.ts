import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/phash.service", () => ({
  checkAndIndexPhoto: vi.fn(async () => ({ accepted: true, hash: "freshhash", hammingDistance: 64 })),
  PHashError: class PHashError extends Error {},
}));

import { POST, GET } from "./route";
import {
  InMemoryBatchDataSource,
  setBatchVerificationDataSource,
} from "@/services/batch-verification.service";

const REGION = { latitude: 6.5244, longitude: 3.3792, radiusMeters: 500 };

function jsonBody(overrides: Record<string, unknown> = {}) {
  return {
    campaignId: "campaign-1",
    verifier: "verifier-1",
    region: REGION,
    treeCount: 100,
    photos: [
      { key: "p1" },
      { key: "p2" },
      { key: "p3" },
      { key: "p4" },
      { key: "p5" },
    ],
    ...overrides,
  };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/verification-batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => setBatchVerificationDataSource(new InMemoryBatchDataSource()));

describe("POST /api/verification-batches (JSON)", () => {
  it("creates a pending batch (201)", async () => {
    const res = await POST(post(jsonBody()));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.treeCount).toBe(100);
    expect(body.id).toBeTruthy();
  });

  it("defaults region radius to 500 m when omitted", async () => {
    const res = await POST(post(jsonBody({ region: { latitude: 6.5, longitude: 3.4 } })));
    expect(res.status).toBe(201);
    expect((await res.json()).region.radiusMeters).toBe(500);
  });

  it("400s on validation failures", async () => {
    const res = await POST(post(jsonBody({ treeCount: 0 })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/treeCount/);
  });

  it("422s when photo GPS is outside the region", async () => {
    const res = await POST(
      post(
        jsonBody({
          photos: [
            { key: "far.jpg", gps: { latitude: 6.42, longitude: 3.3792 } },
            { key: "p2" },
            { key: "p3" },
            { key: "p4" },
            { key: "p5" },
          ],
        }),
      ),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/outside the 500 m radius/);
  });

  it("400s on invalid JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/verification-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/verification-batches (multipart)", () => {
  it("accepts file uploads and stores hashes", async () => {
    const form = new FormData();
    form.set("campaignId", "campaign-1");
    form.set("verifier", "verifier-1");
    form.set("treeCount", "20");
    form.set("region", JSON.stringify(REGION));
    for (let i = 0; i < 5; i++) {
      form.append("photo", new File([new Uint8Array([1, 2, 3, i])], `p${i}.jpg`, { type: "image/jpeg" }));
    }

    const res = await POST(
      new Request("http://localhost/api/verification-batches", { method: "POST", body: form }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.photos).toHaveLength(5);
    expect(body.photos[0].hash).toBe("freshhash");
  });

  it("409s when a duplicate photo is detected", async () => {
    const { checkAndIndexPhoto } = await import("@/services/phash.service");
    (checkAndIndexPhoto as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accepted: false,
      hash: "dupe",
      duplicateOf: "milestone-42",
      hammingDistance: 2,
    });

    const form = new FormData();
    form.set("campaignId", "c");
    form.set("verifier", "v");
    form.set("treeCount", "20");
    form.set("region", JSON.stringify(REGION));
    form.append("photo", new File([new Uint8Array([9, 9])], "dupe.jpg", { type: "image/jpeg" }));

    const res = await POST(
      new Request("http://localhost/api/verification-batches", { method: "POST", body: form }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.duplicateOf).toBe("milestone-42");
  });

  it("400s when no photo files are attached", async () => {
    const form = new FormData();
    form.set("campaignId", "c");
    form.set("verifier", "v");
    form.set("treeCount", "20");
    form.set("region", JSON.stringify(REGION));

    const res = await POST(
      new Request("http://localhost/api/verification-batches", { method: "POST", body: form }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/verification-batches", () => {
  it("lists batches with filters and pagination envelope", async () => {
    await POST(post(jsonBody()));
    await POST(post(jsonBody({ campaignId: "campaign-2" })));

    const all = await GET(new Request("http://localhost/api/verification-batches"));
    const allBody = await all.json();
    expect(allBody.data).toHaveLength(2);
    expect(allBody.pagination).toEqual({ limit: 20, offset: 0, count: 2 });

    const filtered = await GET(
      new Request("http://localhost/api/verification-batches?campaignId=campaign-2&limit=1"),
    );
    const filteredBody = await filtered.json();
    expect(filteredBody.data).toHaveLength(1);
    expect(filteredBody.data[0].campaignId).toBe("campaign-2");
    expect(filteredBody.pagination.limit).toBe(1);
  });

  it("ignores invalid status filters", async () => {
    await POST(post(jsonBody()));
    const res = await GET(
      new Request("http://localhost/api/verification-batches?status=bogus"),
    );
    expect((await res.json()).data).toHaveLength(1);
  });
});
