import { beforeEach, describe, expect, it } from "vitest";
import {
  BatchConflictError,
  BatchNotFoundError,
  BatchValidationError,
  InMemoryBatchDataSource,
  MAX_PHOTOS_PER_BATCH,
  MAX_REGION_RADIUS_M,
  MAX_TREES_PER_BATCH,
  TREES_PER_PHOTO,
  createBatch,
  getBatch,
  getBatchTrees,
  haversineMeters,
  photosWithinRegion,
  queryBatches,
  rejectBatch,
  setBatchVerificationDataSource,
  validateBatchInput,
  verifyBatch,
  type BatchPhotoRef,
  type CreateBatchInput,
} from "./batch-verification.service";

const REGION = { latitude: 6.5244, longitude: 3.3792, radiusMeters: 500 };

function photo(key: string, gps?: { latitude: number; longitude: number } | null): BatchPhotoRef {
  return { key, gps: gps ?? null };
}

function input(overrides: Partial<CreateBatchInput> = {}): CreateBatchInput {
  return {
    campaignId: "campaign-1",
    verifier: "verifier-1",
    region: { ...REGION },
    treeCount: 100,
    photos: [photo("p1"), photo("p2"), photo("p3"), photo("p4"), photo("p5")],
    ...overrides,
  };
}

describe("batch-verification service", () => {
  beforeEach(() => setBatchVerificationDataSource(new InMemoryBatchDataSource()));

  // ── validation ──────────────────────────────────────────────────────────

  describe("validateBatchInput", () => {
    it("accepts the issue example: 100 trees in one region with 5 photos", () => {
      expect(() => validateBatchInput(input())).not.toThrow();
    });

    it("rejects zero/negative and over-cap tree counts", () => {
      expect(() => validateBatchInput(input({ treeCount: 0 }))).toThrow(BatchValidationError);
      expect(() => validateBatchInput(input({ treeCount: -5 }))).toThrow(BatchValidationError);
      const capPhotos = Array.from({ length: MAX_PHOTOS_PER_BATCH }, (_, i) => photo(`p${i}`));
      expect(() => validateBatchInput(input({ treeCount: MAX_TREES_PER_BATCH, photos: capPhotos }))).not.toThrow();
      expect(() => validateBatchInput(input({ treeCount: MAX_TREES_PER_BATCH + 1 }))).toThrow(
        /batch cap/,
      );
    });

    it("enforces the 1-photo-per-20-trees coverage rule", () => {
      // 100 trees need ceil(100/20) = 5 photos; 4 is too few.
      expect(() => validateBatchInput(input({ photos: input().photos.slice(0, 4) }))).toThrow(
        /photo coverage too low/,
      );
      // 101 trees need 6 photos.
      expect(
        () =>
          validateBatchInput(
            input({ treeCount: 101, photos: input().photos.slice(0, 5) }),
          ),
      ).toThrow(/at least 6 photos/);
    });

    it("rejects more photos than the cap", () => {
      const photos = Array.from({ length: MAX_PHOTOS_PER_BATCH + 1 }, (_, i) => photo(`p${i}`));
      expect(() => validateBatchInput(input({ photos }))).toThrow(/50 photos per batch/);
    });

    it("rejects empty photo arrays and missing ids", () => {
      expect(() => validateBatchInput(input({ photos: [] }))).toThrow(/at least one photo/);
      expect(() => validateBatchInput(input({ campaignId: "" }))).toThrow(/campaignId is required/);
      expect(() => validateBatchInput(input({ verifier: "" }))).toThrow(/verifier is required/);
    });

    it("rejects malformed regions", () => {
      expect(() => validateBatchInput(input({ region: { ...REGION, latitude: 91 } }))).toThrow(
        /latitude must be within/,
      );
      expect(() => validateBatchInput(input({ region: { ...REGION, longitude: -181 } }))).toThrow(
        /longitude must be within/,
      );
      expect(() =>
        validateBatchInput(input({ region: { ...REGION, radiusMeters: MAX_REGION_RADIUS_M + 1 } })),
      ).toThrow(/radiusMeters must be within/);
      expect(() =>
        validateBatchInput(input({ region: { ...REGION, latitude: Number.NaN } })),
      ).toThrow(/finite number/);
    });
  });

  // ── geo math ────────────────────────────────────────────────────────────

  describe("haversineMeters", () => {
    it("measures a known short distance", () => {
      // ~111 m for 0.001 degrees latitude.
      const d = haversineMeters(6.5244, 3.3792, 6.5254, 3.3792);
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(120);
    });

    it("is symmetric and zero for identical points", () => {
      expect(haversineMeters(6.5, 3.4, 6.5, 3.4)).toBe(0);
      const a = haversineMeters(6.5, 3.4, 6.6, 3.5);
      const b = haversineMeters(6.6, 3.5, 6.5, 3.4);
      expect(a).toBeCloseTo(b, 6);
    });
  });

  describe("photosWithinRegion", () => {
    it("accepts photos without GPS and photos inside the radius", () => {
      const inside = {
        key: "inside",
        gps: { latitude: REGION.latitude + 0.001, longitude: REGION.longitude },
      }; // ~111 m north
      expect(() => photosWithinRegion(REGION, [photo("x"), inside])).not.toThrow();
    });

    it("rejects photos outside the radius (with 50 m tolerance)", () => {
      // ~1.1 km south — far outside the 500 m radius.
      const outside = {
        key: "far-away.jpg",
        gps: { latitude: REGION.latitude - 0.01, longitude: REGION.longitude },
      };
      expect(() => photosWithinRegion(REGION, [outside])).toThrow(/far-away\.jpg/);
    });

    it("uses the configured radius, not a fixed one", () => {
      const near = {
        key: "near.jpg",
        gps: { latitude: REGION.latitude + 0.002, longitude: REGION.longitude },
      }; // ~222 m
      expect(() => photosWithinRegion({ ...REGION, radiusMeters: 500 }, [near])).not.toThrow();
      expect(() => photosWithinRegion({ ...REGION, radiusMeters: 100 }, [near])).toThrow();
    });
  });

  // ── deterministic geo spread ────────────────────────────────────────────

  describe("getBatchTrees", () => {
    it("places exactly treeCount trees", () => {
      expect(getBatchTrees({ region: REGION, treeCount: 100 })).toHaveLength(100);
    });

    it("keeps every tree inside the region circle", () => {
      const placements = getBatchTrees({ region: REGION, treeCount: 250 });
      for (const p of placements) {
        expect(haversineMeters(REGION.latitude, REGION.longitude, p.latitude, p.longitude)).toBeLessThanOrEqual(
          REGION.radiusMeters + 1e-6,
        );
      }
    });

    it("is deterministic (same input, same placements) and spread out", () => {
      const a = getBatchTrees({ region: REGION, treeCount: 50 });
      const b = getBatchTrees({ region: REGION, treeCount: 50 });
      expect(a).toEqual(b);

      // Spread: the mean pairwise distance proxy — centroid of placements
      // should be near the region centre, and at least one tree > half radius.
      const maxDist = Math.max(
        ...a.map((p) => haversineMeters(REGION.latitude, REGION.longitude, p.latitude, p.longitude)),
      );
      expect(maxDist).toBeGreaterThan(REGION.radiusMeters * 0.5);
    });
  });

  // ── store operations ────────────────────────────────────────────────────

  describe("createBatch / queryBatch / getBatch", () => {
    it("creates a pending batch with an id and timestamps", async () => {
      const batch = await createBatch(input());
      expect(batch.id).toBeTruthy();
      expect(batch.status).toBe("pending");
      expect(batch.photos).toHaveLength(5);
      expect(batch.createdAt).toBeGreaterThan(0);
    });

    it("propagates validation errors from create", async () => {
      await expect(createBatch(input({ treeCount: 0 }))).rejects.toThrow(BatchValidationError);
    });

    it("rejects photos with EXIF GPS outside the region", async () => {
      const far = photo("drone-shot.jpg", {
        latitude: REGION.latitude - 0.05,
        longitude: REGION.longitude,
      });
      await expect(createBatch(input({ photos: [far, ...input().photos.slice(0, 4)] }))).rejects.toThrow(
        /outside the 500 m radius/,
      );
    });

    it("queries with filters and pagination", async () => {
      await createBatch(input({ campaignId: "c1" }));
      await createBatch(input({ campaignId: "c2" }));
      await createBatch(input({ campaignId: "c1", verifier: "verifier-2" }));

      const c1 = await queryBatches({ filter: { campaignId: "c1" } });
      expect(c1.data).toHaveLength(2);
      expect(c1.pagination.count).toBe(2);

      const v2 = await queryBatches({ filter: { verifier: "verifier-2" } });
      expect(v2.data).toHaveLength(1);

      const page = await queryBatches({ limit: 2, offset: 0 });
      expect(page.data).toHaveLength(2);
    });

    it("returns null for an unknown batch id", async () => {
      expect(await getBatch("does-not-exist")).toBeNull();
    });
  });

  // ── status transitions ──────────────────────────────────────────────────

  describe("verifyBatch / rejectBatch", () => {
    it("verifies a pending batch by its own verifier", async () => {
      const batch = await createBatch(input());
      const verified = await verifyBatch(batch.id, "verifier-1");
      expect(verified.status).toBe("verified");
      expect(verified.verifiedAt).toBeGreaterThan(0);
    });

    it("rejects with a required reason", async () => {
      const batch = await createBatch(input());
      const rejected = await rejectBatch(batch.id, "verifier-1", "  blurry photos  ");
      expect(rejected.status).toBe("rejected");
      expect(rejected.rejectionReason).toBe("blurry photos");
      await expect(rejectBatch(batch.id, "verifier-1", "x")).rejects.toThrow(BatchConflictError);
    });

    it("refuses an empty rejection reason", async () => {
      const batch = await createBatch(input());
      await expect(rejectBatch(batch.id, "verifier-1", "   ")).rejects.toThrow(/reason is required/);
    });

    it("blocks other verifiers from resolving", async () => {
      const batch = await createBatch(input());
      await expect(verifyBatch(batch.id, "someone-else")).rejects.toThrow(/only the submitting verifier/);
      await expect(rejectBatch(batch.id, "someone-else", "nope")).rejects.toThrow(
        /only the submitting verifier/,
      );
    });

    it("prevents double resolution (409-class conflict)", async () => {
      const batch = await createBatch(input());
      await verifyBatch(batch.id, "verifier-1");
      await expect(verifyBatch(batch.id, "verifier-1")).rejects.toThrow(BatchConflictError);
      await expect(rejectBatch(batch.id, "verifier-1", "late")).rejects.toThrow(BatchConflictError);
    });

    it("throws NotFound for missing batches", async () => {
      await expect(verifyBatch("ghost", "verifier-1")).rejects.toThrow(BatchNotFoundError);
      await expect(rejectBatch("ghost", "verifier-1", "x")).rejects.toThrow(BatchNotFoundError);
    });
  });

  // ── constants sanity ────────────────────────────────────────────────────

  it("keeps the documented caps coherent", () => {
    expect(MAX_TREES_PER_BATCH).toBe(1000);
    expect(MAX_PHOTOS_PER_BATCH).toBe(50);
    expect(TREES_PER_PHOTO).toBe(20);
    expect(MAX_REGION_RADIUS_M).toBe(5000);
    // The issue example must be satisfiable: 100 trees, 5 photos.
    expect(Math.ceil(100 / TREES_PER_PHOTO)).toBe(5);
  });
});
