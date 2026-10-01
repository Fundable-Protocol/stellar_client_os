import {
  BatchGeoError,
  BatchValidationError,
  createBatch,
  queryBatches,
  type BatchPhotoRef,
  type BatchStatus,
} from "@/services/batch-verification.service";
import { checkAndIndexPhoto, PHashError } from "@/services/phash.service";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB across all photos

const STATUSES: BatchStatus[] = ["pending", "verified", "rejected"];

interface BatchJsonBody {
  campaignId?: string;
  verifier?: string;
  region?: { latitude?: unknown; longitude?: unknown; radiusMeters?: unknown };
  treeCount?: unknown;
  photos?: unknown;
}

/**
 * POST /api/verification-batches — create a batch verification submission.
 *
 * Two content types are accepted:
 *  - `application/json`: `{ campaignId, verifier, region, treeCount, photos }`
 *    where `photos` is an array of `{ key, hash?, gps? }` referencing
 *    pre-uploaded files (e.g. via /api/presign-upload).
 *  - `multipart/form-data`: `campaignId`, `verifier`, `region` (JSON string),
 *    `treeCount`, plus 1..50 `photo` files. Each file is perceptual-hash
 *    checked (duplicate rejection) and EXIF-parsed for the GPS cross-check.
 *
 * # Responses
 * | Status | Meaning                                             |
 * |--------|-----------------------------------------------------|
 * | 201    | Batch created (status `pending`)                    |
 * | 400    | Validation error (bad fields, malformed body)       |
 * | 409    | Duplicate photo detected by perceptual hash         |
 * | 413    | Payload too large                                   |
 * | 422    | Photo EXIF GPS outside the submitted region         |
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  let campaignId: string;
  let verifier: string;
  let region: { latitude: number; longitude: number; radiusMeters: number };
  let treeCount: number;
  let photos: BatchPhotoRef[];

  try {
    if (contentType.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (contentLength > MAX_BODY_BYTES) {
        return Response.json({ error: "payload too large" }, { status: 413 });
      }

      const form = await request.formData();
      campaignId = String(form.get("campaignId") ?? "");
      verifier = String(form.get("verifier") ?? "");
      treeCount = Number(form.get("treeCount"));

      let parsedRegion: unknown;
      try {
        parsedRegion = JSON.parse(String(form.get("region") ?? "{}"));
      } catch {
        return Response.json({ error: "region must be valid JSON" }, { status: 400 });
      }
      region = parsedRegion as { latitude: number; longitude: number; radiusMeters: number };

      const files = form.getAll("photo").filter((v): v is File => v instanceof File);
      if (files.length === 0) {
        return Response.json({ error: "at least one photo file is required" }, { status: 400 });
      }
      if (files.length > 50) {
        return Response.json({ error: "more than 50 photos per batch is not allowed" }, { status: 400 });
      }

      photos = [];
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        try {
          const result = await checkAndIndexPhoto(buffer, `${crypto.randomUUID()}`);
          if (!result.accepted) {
            return Response.json(
              {
                error: "duplicate photo detected",
                hash: result.hash,
                duplicateOf: result.duplicateOf,
                hammingDistance: result.hammingDistance,
              },
              { status: 409 },
            );
          }
          photos.push({ key: result.hash, hash: result.hash });
        } catch (error) {
          if (error instanceof PHashError) {
            return Response.json({ error: error.message }, { status: 400 });
          }
          throw error;
        }
      }
    } else {
      const body = (await request.json()) as BatchJsonBody;

      campaignId = String(body.campaignId ?? "");
      verifier = String(body.verifier ?? "");
      treeCount = Number(body.treeCount);

      const rawRegion = (body.region ?? {}) as Record<string, unknown>;
      region = {
        latitude: Number(rawRegion.latitude),
        longitude: Number(rawRegion.longitude),
        radiusMeters:
          rawRegion.radiusMeters === undefined ? 500 : Number(rawRegion.radiusMeters),
      };

      const rawPhotos = Array.isArray(body.photos) ? body.photos : [];
      photos = rawPhotos.map((p) => {
        const rec = (p ?? {}) as Record<string, unknown>;
        const gps = rec.gps as { latitude: number; longitude: number } | null | undefined;
        return {
          key: String(rec.key ?? ""),
          hash: rec.hash === undefined ? undefined : String(rec.hash),
          gps:
            gps && typeof gps.latitude === "number" && typeof gps.longitude === "number"
              ? { latitude: gps.latitude, longitude: gps.longitude }
              : null,
        };
      });
    }

    const batch = await createBatch({ campaignId, verifier, region, treeCount, photos });
    return Response.json(batch, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    if (error instanceof BatchGeoError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof BatchValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "internal error creating batch" }, { status: 500 });
  }
}

/**
 * GET /api/verification-batches?campaignId=&verifier=&status=&limit=&offset=
 * Lists batch submissions (newest first).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const result = await queryBatches({
    filter: {
      campaignId: url.searchParams.get("campaignId") ?? undefined,
      verifier: url.searchParams.get("verifier") ?? undefined,
      status: status && STATUSES.includes(status as BatchStatus) ? (status as BatchStatus) : undefined,
    },
    limit: Number(url.searchParams.get("limit") ?? 20),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });

  return Response.json(result);
}
