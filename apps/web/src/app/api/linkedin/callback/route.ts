/**
 * GET /api/linkedin/callback
 *
 * LinkedIn OAuth 2.0 callback handler.
 *
 * Flow:
 *  1. LinkedIn redirects the user here with `?code=...&state=...`
 *  2. Validate the CSRF state token → resolve the creator address.
 *  3. Exchange the code for an access token.
 *  4. Fetch profile + skills and persist the connection.
 *  5. Redirect the user back to their settings page (or return JSON for
 *     API-only callers).
 *
 * Error responses redirect to the settings page with an `?error=` query param
 * so the UI can surface a human-readable message.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  connectLinkedIn,
  resolveState,
} from "@/services/linkedin.service";

export const runtime = "nodejs";

/** URL to redirect the creator after a successful connect */
function settingsUrl(address: string, success: boolean, message?: string): string {
  const base = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000";
  const params = new URLSearchParams({ address });
  if (success) {
    params.set("linkedin_connected", "1");
  } else if (message) {
    params.set("linkedin_error", message);
  }
  return `${base}/creators/${address}?${params.toString()}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const linkedInError = searchParams.get("error");
  const linkedInErrorDescription = searchParams.get("error_description");

  // LinkedIn returned an error (e.g. user denied access)
  if (linkedInError) {
    const description = linkedInErrorDescription ?? linkedInError;
    return NextResponse.redirect(
      // We don't know the creator address at this point, redirect to root
      `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/?linkedin_error=${encodeURIComponent(description)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing required query parameters: code, state" },
      { status: 400 },
    );
  }

  let creatorAddress: string;
  try {
    creatorAddress = resolveState(state);
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired state parameter" },
      { status: 400 },
    );
  }

  try {
    await connectLinkedIn(creatorAddress, code);
    return NextResponse.redirect(settingsUrl(creatorAddress, true));
  } catch (err) {
    const message = err instanceof Error ? err.message : "LinkedIn connection failed";
    console.error("[linkedin/callback] connection error:", err);
    return NextResponse.redirect(settingsUrl(creatorAddress, false, message));
  }
}
