/**
 * /api/creators/[address]/linkedin
 *
 * GET    — Return the creator's public LinkedIn data (profile + skills, no token).
 * POST   — Initiate the LinkedIn OAuth flow; returns { authorizationUrl }.
 * DELETE — Disconnect the creator's LinkedIn account.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizationUrl,
  disconnectLinkedIn,
  getPublicLinkedInData,
} from "@/services/linkedin.service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ address: string }> };

// ---------------------------------------------------------------------------
// GET — retrieve public LinkedIn data
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { address } = await params;
  const data = getPublicLinkedInData(address);

  if (!data) {
    return NextResponse.json({ connected: false, data: null }, { status: 200 });
  }

  return NextResponse.json({ connected: true, data }, { status: 200 });
}

// ---------------------------------------------------------------------------
// POST — start OAuth flow
// ---------------------------------------------------------------------------
export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { address } = await params;

  if (!address || address.trim().length < 10) {
    return NextResponse.json({ error: "Invalid creator address" }, { status: 400 });
  }

  try {
    const authorizationUrl = buildAuthorizationUrl(address);
    return NextResponse.json({ authorizationUrl }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build authorization URL";
    // Most likely cause: missing LINKEDIN_CLIENT_ID / LINKEDIN_REDIRECT_URI env vars
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — disconnect
// ---------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { address } = await params;
  const removed = disconnectLinkedIn(address);

  if (!removed) {
    return NextResponse.json(
      { error: "No LinkedIn connection found for this address" },
      { status: 404 },
    );
  }

  return NextResponse.json({ disconnected: true }, { status: 200 });
}
