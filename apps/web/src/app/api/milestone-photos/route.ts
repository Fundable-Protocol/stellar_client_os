import { NextRequest, NextResponse } from "next/server";
import {
  checkAndIndexPhoto,
  validateMimeType,
  removeFromIndex,
  indexSize,
  PHashError,
} from "@/services/phash.service";

/** Maximum accepted upload size: 10 MB */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/milestone-photos
 *
 * Accepts a milestone photo upload (multipart/form-data), computes its
 * perceptual hash, and rejects duplicates or near-duplicate (stock photo)
 * submissions before they reach the on-chain verification step.
 *
 * # Request
 * `multipart/form-data` with fields:
 * | Field          | Type   | Required | Description                          |
 * |----------------|--------|----------|--------------------------------------|
 * | `photo`        | File   | ✓        | The milestone photo (PNG/JPEG/WebP)  |
 * | `submissionId` | string | ✓        | Unique ID for this submission        |
 * | `threshold`    | number | ✗        | Override Hamming threshold (0–64)    |
 *
 * # Responses
 * | Status | Meaning                                          |
 * |--------|--------------------------------------------------|
 * | 200    | Photo accepted — unique, hash indexed            |
 * | 409    | Photo rejected — duplicate detected              |
 * | 400    | Validation error (missing fields, bad format)    |
 * | 413    | Payload too large (> 10 MB)                      |
 * | 500    | Internal error                                   |
 *
 * # 200 response body
 * ```json
 * { "accepted": true, "hash": "a1b2c3d4e5f60718", "hammingDistance": 0 }
 * ```
 *
 * # 409 response body
 * ```json
 * { "accepted": false, "hash": "...", "hammingDistance": 4, "duplicateOf": "milestone-42" }
 * ```
 */
export async function POST(req: NextRequest) {
  // ── Size guard (check Content-Length before buffering) ────────────────────
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large. Maximum upload size is 10 MB." },
      { status: 413 }
    );
  }

  // ── Parse multipart form data ─────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart/form-data body" },
      { status: 400 }
    );
  }

  const photoFile = formData.get("photo");
  const submissionId = formData.get("submissionId");
  const thresholdRaw = formData.get("threshold");

  if (!photoFile || !(photoFile instanceof File)) {
    return NextResponse.json(
      { error: "Missing required field: photo (must be a file)" },
      { status: 400 }
    );
  }
  if (!submissionId || typeof submissionId !== "string" || !submissionId.trim()) {
    return NextResponse.json(
      { error: "Missing required field: submissionId" },
      { status: 400 }
    );
  }

  // ── MIME type validation ──────────────────────────────────────────────────
  try {
    validateMimeType(photoFile.type || "image/jpeg");
  } catch (err) {
    if (err instanceof PHashError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json({ error: "Unsupported image format" }, { status: 400 });
  }

  // ── Buffer the upload (enforce size limit while streaming) ────────────────
  const arrayBuffer = await photoFile.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Payload too large. Maximum upload size is 10 MB." },
      { status: 413 }
    );
  }
  const buffer = Buffer.from(arrayBuffer);

  // ── Optional threshold override ───────────────────────────────────────────
  let threshold: number | undefined;
  if (thresholdRaw !== null) {
    const parsed = Number(thresholdRaw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 64) {
      return NextResponse.json(
        { error: "threshold must be an integer between 0 and 64" },
        { status: 400 }
      );
    }
    threshold = parsed;
  }

  // ── pHash check ───────────────────────────────────────────────────────────
  try {
    const result = await checkAndIndexPhoto(buffer, submissionId.trim(), {
      threshold,
    });

    if (!result.accepted) {
      return NextResponse.json(
        {
          accepted: false,
          hash: result.hash,
          hammingDistance: result.hammingDistance,
          duplicateOf: result.duplicateOf,
          message: `Duplicate photo detected (Hamming distance: ${result.hammingDistance}). ` +
            `This image is too similar to submission "${result.duplicateOf}".`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        accepted: true,
        hash: result.hash,
        hammingDistance: result.hammingDistance,
        duplicateOf: null,
        message: "Photo accepted and indexed successfully.",
      },
      { status: 200 }
    );
  } catch (err) {
    if (err instanceof PHashError) {
      const status =
        err.code === "UNSUPPORTED_FORMAT" || err.code === "IMAGE_TOO_SMALL"
          ? 400
          : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[/api/milestone-photos] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/milestone-photos?hash=<hex>
 *
 * Remove a hash from the index (e.g. on submission rollback).
 * Returns 200 if removed, 404 if not found.
 */
export async function DELETE(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash");
  if (!hash || !/^[0-9a-f]{16}$/i.test(hash)) {
    return NextResponse.json(
      { error: "Missing or invalid hash query parameter (must be 16-char hex)" },
      { status: 400 }
    );
  }

  const removed = removeFromIndex(hash);
  if (!removed) {
    return NextResponse.json({ error: "Hash not found in index" }, { status: 404 });
  }
  return NextResponse.json({ removed: true, hash }, { status: 200 });
}

/**
 * GET /api/milestone-photos/stats
 *
 * Returns the current hash index size for monitoring.
 */
export async function GET() {
  return NextResponse.json({ indexSize: indexSize() }, { status: 200 });
}
