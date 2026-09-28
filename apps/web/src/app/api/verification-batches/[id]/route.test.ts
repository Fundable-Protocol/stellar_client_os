import { beforeEach, describe, expect, it } from "vitest";
import { GET, PATCH } from "./route";
import { POST as POST_COLLECTION } from "../route";
import {
  InMemoryBatchDataSource,
  setBatchVerificationDataSource,
  type CreateBatchInput,
} from "@/services/batch-verification.service";

const REGION = { latitude: 6.5244, longitude: 3.3792, radiusMeters: 500 };

async function createBatch(): Promise<string> {
  const res = await POST_COLLECTION(
    new Request("http://localhost/api/verification-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-1",
        verifier: "verifier-1",
        region: REGION,
        treeCount: 100,
        photos: [{ key: "p1" }, { key: "p2" }, { key: "p3" }, { key: "p4" }, { key: "p5" }] as never,
      } satisfies CreateBatchInput),
    }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

beforeEach(() => setBatchVerificationDataSource(new InMemoryBatchDataSource()));

describe("GET /api/verification-batches/[id]", () => {
  it("returns a batch by id", async () => {
    const id = await createBatch();
    const res = await GET(new Request(`http://localhost/api/verification-batches/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(id);
  });

  it("expands deterministic tree placements with ?include=trees", async () => {
    const id = await createBatch();
    const res = await GET(
      new Request(`http://localhost/api/verification-batches/${id}?include=trees`),
      { params: Promise.resolve({ id }) },
    );
    const body = await res.json();
    expect(body.trees).toHaveLength(100);
    expect(body.trees[0]).toHaveProperty("latitude");
    expect(body.trees[0]).toHaveProperty("longitude");
  });

  it("404s for unknown ids", async () => {
    const res = await GET(new Request("http://localhost/api/verification-batches/ghost"), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/verification-batches/[id]", () => {
  function patch(id: string, body: unknown): Request {
    return new Request(`http://localhost/api/verification-batches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("verifies a pending batch", async () => {
    const id = await createBatch();
    const res = await PATCH(patch(id, { action: "verify", verifier: "verifier-1" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("verified");
  });

  it("rejects with a reason", async () => {
    const id = await createBatch();
    const res = await PATCH(
      patch(id, { action: "reject", verifier: "verifier-1", reason: "photos do not match campaign region" }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("rejected");
    expect(body.rejectionReason).toBe("photos do not match campaign region");
  });

  it("409s on double resolution", async () => {
    const id = await createBatch();
    await PATCH(patch(id, { action: "verify", verifier: "verifier-1" }), {
      params: Promise.resolve({ id }),
    });
    const res = await PATCH(patch(id, { action: "verify", verifier: "verifier-1" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(409);
  });

  it("400s on missing verifier / unknown action", async () => {
    const id = await createBatch();
    const noVerifier = await PATCH(patch(id, { action: "verify" }), {
      params: Promise.resolve({ id }),
    });
    expect(noVerifier.status).toBe(400);

    const badAction = await PATCH(patch(id, { action: "explode", verifier: "verifier-1" }), {
      params: Promise.resolve({ id }),
    });
    expect(badAction.status).toBe(400);
  });

  it("404s on unknown batch", async () => {
    const res = await PATCH(patch("ghost", { action: "verify", verifier: "verifier-1" }), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });
});
