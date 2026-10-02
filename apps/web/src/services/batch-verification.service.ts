/**
 * Campaign batch verification — issue #953
 *
 * Allows verifiers to verify multiple trees in one batch submission:
 * e.g. 100 trees in 1 region with a single GPS coordinate + 5 photos.
 *
 * ## Rules
 * - Batch caps: max 1000 trees and 50 photos per batch.
 * - Photo coverage: at least 1 photo per 20 trees (100 trees ⇒ ≥ 5 photos).
 * - Single regional GPS: one lat/lng + radius (default 500 m, max 5 000 m);
 *   every tree in the batch is placed deterministically inside that circle.
 * - EXIF cross-check: photo GPS, when present, must fall inside the region.
 * - Duplicate-photo protection is performed at the API layer via
 *   `phash.service` (`checkAndIndexPhoto`) before a batch is stored; this
 *   service records the resulting hashes for audit.
 *
 * Storage follows the same in-memory data-source pattern as
 * `campaign.service.ts` (swap via `setBatchVerificationDataSource` in tests
 * or when a durable backend lands).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const MAX_TREES_PER_BATCH = 1000;
export const MAX_PHOTOS_PER_BATCH = 50;
/** Minimum photos required per tree (1 photo covers up to this many trees). */
export const TREES_PER_PHOTO = 20;
export const DEFAULT_REGION_RADIUS_M = 500;
export const MAX_REGION_RADIUS_M = 5000;

/** Metres per degree of latitude (approximation, good to ~1 m/degree). */
const METERS_PER_DEGREE_LAT = 111_320;

// ── Types ─────────────────────────────────────────────────────────────────────

export type BatchStatus = "pending" | "verified" | "rejected";

export interface BatchRegion {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface BatchPhotoRef {
  /** Storage key of the uploaded photo (S3 key or logical id). */
  key: string;
  /** Perceptual hash from phash.service, when the photo was buffered. */
  hash?: string;
  /** EXIF GPS of the photo, when present. */
  gps?: { latitude: number; longitude: number } | null;
  /** Tree species identified in this photo proof (Issue #906) */
  species?: string;
}

export interface BatchSubmission {
  id: string;
  campaignId: string;
  verifier: string;
  region: BatchRegion;
  treeCount: number;
  photos: BatchPhotoRef[];
  status: BatchStatus;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
  verifiedAt?: number;
}

export interface BatchTreePlacement {
  index: number;
  latitude: number;
  longitude: number;
}

export interface BatchFilter {
  campaignId?: string;
  verifier?: string;
  status?: BatchStatus;
}

export interface BatchQueryInput {
  filter?: BatchFilter;
  limit?: number;
  offset?: number;
}

export interface CreateBatchInput {
  campaignId: string;
  verifier: string;
  region: BatchRegion;
  treeCount: number;
  photos: BatchPhotoRef[];
  /** Expected or declared tree species for the campaign (Issue #906) */
  treeSpecies?: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class BatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchValidationError";
  }
}

export class BatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchConflictError";
  }
}

export class BatchNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BatchNotFoundError";
  }
}

/** Photo GPS falls outside the batch region — HTTP 422 at the API layer. */
export class BatchGeoError extends BatchValidationError {}

// ── Data source ───────────────────────────────────────────────────────────────

export interface BatchVerificationDataSource {
  getBatches(): Promise<BatchSubmission[]>;
  saveBatch(batch: BatchSubmission): Promise<BatchSubmission>;
}

export class InMemoryBatchDataSource implements BatchVerificationDataSource {
  private batches = new Map<string, BatchSubmission>();

  async getBatches(): Promise<BatchSubmission[]> {
    return Array.from(this.batches.values());
  }

  async saveBatch(batch: BatchSubmission): Promise<BatchSubmission> {
    this.batches.set(batch.id, batch);
    return batch;
  }
}

let defaultDataSource: BatchVerificationDataSource | undefined;

export function getBatchVerificationDataSource(): BatchVerificationDataSource {
  return (defaultDataSource ??= new InMemoryBatchDataSource());
}

export function setBatchVerificationDataSource(dataSource: BatchVerificationDataSource): void {
  defaultDataSource = dataSource;
}

/** Test helper: drop the default in-memory store. */
export function resetBatchStore(): void {
  defaultDataSource = undefined;
}

// ── Validation ────────────────────────────────────────────────────────────────

function requireFinite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BatchValidationError(`${label} must be a finite number`);
  }
}

/** Validates all invariants of a create request; throws on the first violation. */
export function validateBatchInput(input: CreateBatchInput): void {
  if (!input.campaignId) throw new BatchValidationError("campaignId is required");
  if (!input.verifier) throw new BatchValidationError("verifier is required");

  if (!Number.isInteger(input.treeCount) || input.treeCount <= 0) {
    throw new BatchValidationError("treeCount must be a positive integer");
  }
  if (input.treeCount > MAX_TREES_PER_BATCH) {
    throw new BatchValidationError(`treeCount exceeds the batch cap of ${MAX_TREES_PER_BATCH}`);
  }

  if (!Array.isArray(input.photos) || input.photos.length === 0) {
    throw new BatchValidationError("at least one photo is required");
  }

  // Issue #906: Require uploaded photos to match declared species to prevent fraud
  if (input.treeSpecies) {
    const normalizedDeclared = input.treeSpecies.trim().toLowerCase();
    for (const p of input.photos) {
      if (p.species && p.species.trim().toLowerCase() !== normalizedDeclared) {
        throw new BatchValidationError(
          `Uploaded photo species '${p.species}' does not match declared campaign species '${input.treeSpecies}'`
        );
      }
    }
  }
  if (input.photos.length > MAX_PHOTOS_PER_BATCH) {
    throw new BatchValidationError(`more than ${MAX_PHOTOS_PER_BATCH} photos per batch is not allowed`);
  }

  const minPhotos = Math.ceil(input.treeCount / TREES_PER_PHOTO);
  if (input.photos.length < minPhotos) {
    throw new BatchValidationError(
      `photo coverage too low: ${input.treeCount} trees need at least ${minPhotos} photos (1 photo per ${TREES_PER_PHOTO} trees), got ${input.photos.length}`,
    );
  }

  const region = input.region ?? ({} as BatchRegion);
  requireFinite(region.latitude, "region.latitude");
  requireFinite(region.longitude, "region.longitude");
  requireFinite(region.radiusMeters, "region.radiusMeters");
  if (region.latitude < -90 || region.latitude > 90) {
    throw new BatchValidationError("region.latitude must be within [-90, 90]");
  }
  if (region.longitude < -180 || region.longitude > 180) {
    throw new BatchValidationError("region.longitude must be within [-180, 180]");
  }
  if (region.radiusMeters <= 0 || region.radiusMeters > MAX_REGION_RADIUS_M) {
    throw new BatchValidationError(`region.radiusMeters must be within (0, ${MAX_REGION_RADIUS_M}]`);
  }
}

/** Great-circle distance in metres between two coordinates. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * EXIF cross-check: every photo GPS that is present must fall inside the
 * batch region (with a small tolerance for GPS jitter). Throws 422-class
 * `BatchValidationError` when a photo is provably outside.
 */
export function photosWithinRegion(
  region: BatchRegion,
  photos: Pick<BatchPhotoRef, "key" | "gps">[],
  toleranceMeters = 50,
): void {
  for (const photo of photos) {
    if (!photo.gps) continue;
    const distance = haversineMeters(
      region.latitude,
      region.longitude,
      photo.gps.latitude,
      photo.gps.longitude,
    );
    if (distance > region.radiusMeters + toleranceMeters) {
      throw new BatchGeoError(
        `photo "${photo.key}" GPS is ${Math.round(distance)} m from the region centre, outside the ${region.radiusMeters} m radius`,
      );
    }
  }
}

// ── Deterministic geo spread ──────────────────────────────────────────────────

/**
 * Places `treeCount` trees deterministically inside the region using a
 * golden-angle sunflower spiral (even density, stable ordering, no RNG —
 * the same batch always yields the same placements for audits).
 */
export function getBatchTrees(batch: Pick<BatchSubmission, "region" | "treeCount">): BatchTreePlacement[] {
  const goldenAngle = 2.399963229728653;
  const placements: BatchTreePlacement[] = [];
  const cosLat = Math.cos((batch.region.latitude * Math.PI) / 180);

  for (let i = 0; i < batch.treeCount; i++) {
    const r = batch.region.radiusMeters * Math.sqrt((i + 0.5) / batch.treeCount);
    const theta = i * goldenAngle;
    const dLat = (r * Math.cos(theta)) / METERS_PER_DEGREE_LAT;
    const dLng = (r * Math.sin(theta)) / (METERS_PER_DEGREE_LAT * cosLat);
    placements.push({
      index: i,
      latitude: batch.region.latitude + dLat,
      longitude: batch.region.longitude + dLng,
    });
  }
  return placements;
}

// ── Store operations ──────────────────────────────────────────────────────────

export async function createBatch(
  input: CreateBatchInput,
  dataSource = getBatchVerificationDataSource(),
  now = Date.now(),
): Promise<BatchSubmission> {
  validateBatchInput(input);
  photosWithinRegion(input.region, input.photos);

  const batch: BatchSubmission = {
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    verifier: input.verifier,
    region: { ...input.region },
    treeCount: input.treeCount,
    photos: input.photos.map((photo) => ({ ...photo })),
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  return dataSource.saveBatch(batch);
}

export async function getBatch(
  batchId: string,
  dataSource = getBatchVerificationDataSource(),
): Promise<BatchSubmission | null> {
  return (await dataSource.getBatches()).find((batch) => batch.id === batchId) ?? null;
}

export async function queryBatches(
  input: BatchQueryInput = {},
  dataSource = getBatchVerificationDataSource(),
): Promise<{ data: BatchSubmission[]; pagination: { limit: number; offset: number; count: number } }> {
  const filter = input.filter ?? {};
  let batches = (await dataSource.getBatches()).filter((batch) => {
    if (filter.campaignId && batch.campaignId !== filter.campaignId) return false;
    if (filter.verifier && batch.verifier !== filter.verifier) return false;
    if (filter.status && batch.status !== filter.status) return false;
    return true;
  });

  batches.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));

  const offset = Math.max(input.offset ?? 0, 0);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const data = batches.slice(offset, offset + limit);
  return { data, pagination: { limit, offset, count: data.length } };
}

async function loadPendingBatch(
  batchId: string,
  dataSource: BatchVerificationDataSource,
): Promise<BatchSubmission> {
  const batch = await getBatch(batchId, dataSource);
  if (!batch) throw new BatchNotFoundError(`batch ${batchId} not found`);
  if (batch.status !== "pending") {
    throw new BatchConflictError(`batch ${batchId} is already ${batch.status}`);
  }
  return batch;
}

export async function verifyBatch(
  batchId: string,
  verifier: string,
  dataSource = getBatchVerificationDataSource(),
  now = Date.now(),
): Promise<BatchSubmission> {
  if (!verifier) throw new BatchValidationError("verifier is required");
  const batch = await loadPendingBatch(batchId, dataSource);
  if (batch.verifier !== verifier) {
    throw new BatchValidationError("only the submitting verifier can resolve this batch");
  }
  return dataSource.saveBatch({
    ...batch,
    status: "verified",
    verifiedAt: now,
    updatedAt: now,
  });
}

export async function rejectBatch(
  batchId: string,
  verifier: string,
  reason: string,
  dataSource = getBatchVerificationDataSource(),
  now = Date.now(),
): Promise<BatchSubmission> {
  if (!verifier) throw new BatchValidationError("verifier is required");
  if (!reason || !reason.trim()) throw new BatchValidationError("a rejection reason is required");
  const batch = await loadPendingBatch(batchId, dataSource);
  if (batch.verifier !== verifier) {
    throw new BatchValidationError("only the submitting verifier can resolve this batch");
  }
  return dataSource.saveBatch({
    ...batch,
    status: "rejected",
    rejectionReason: reason.trim(),
    updatedAt: now,
  });
}
