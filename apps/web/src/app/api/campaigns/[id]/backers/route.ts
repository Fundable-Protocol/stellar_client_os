import { NextRequest, NextResponse } from "next/server";
import { backersService } from "@/services/campaign-backers.service";
import { TOP_BACKERS_LIMIT, isBackerVisibility } from "@/types/campaign-backers";

/**
 * Top backers for a campaign.
 *
 *  GET    /api/campaigns/:id/backers?limit=10&viewer=G...&creator=G...
 *         Privacy-aware leaderboard (private backers excluded, anonymous
 *         backers redacted). Pass `viewer` = campaign creator for the
 *         un-redacted creator view.
 *  POST   /api/campaigns/:id/backers            record a contribution
 *  PATCH  /api/campaigns/:id/backers            update a backer's privacy
 */

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return TOP_BACKERS_LIMIT;
  return Math.min(parsed, 100);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const viewerAddress = url.searchParams.get("viewer") ?? undefined;
  const creatorAddress = url.searchParams.get("creator") ?? undefined;

  const result = backersService.getTopBackers(id, { limit, viewerAddress, creatorAddress });
  return NextResponse.json(result, { headers: NO_STORE });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      backerAddress?: string;
      amount?: string;
      token?: string;
      displayName?: string;
      avatarUrl?: string;
      message?: string;
      txHash?: string;
    };

    if (!body.backerAddress?.trim()) {
      return NextResponse.json({ error: "backerAddress is required" }, { status: 400, headers: NO_STORE });
    }
    if (!body.amount) {
      return NextResponse.json({ error: "amount is required" }, { status: 400, headers: NO_STORE });
    }

    const contribution = backersService.recordContribution({
      campaignId: id,
      backerAddress: body.backerAddress,
      amount: String(body.amount),
      token: body.token,
      displayName: body.displayName,
      avatarUrl: body.avatarUrl,
      message: body.message,
      txHash: body.txHash,
    });

    return NextResponse.json(
      { success: true, contribution, leaderboard: backersService.getTopBackers(id) },
      { status: 201, headers: NO_STORE },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid contribution payload" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as {
      backerAddress?: string;
      visibility?: unknown;
      showAmount?: boolean;
      allowFeaturing?: boolean;
    };

    if (!body.backerAddress?.trim()) {
      return NextResponse.json({ error: "backerAddress is required" }, { status: 400, headers: NO_STORE });
    }
    if (body.visibility !== undefined && !isBackerVisibility(body.visibility)) {
      return NextResponse.json(
        { error: "visibility must be one of PUBLIC, ANONYMOUS, PRIVATE" },
        { status: 400, headers: NO_STORE },
      );
    }

    const { preference, removedFromFeatured } = backersService.setPrivacyPreference({
      campaignId: id,
      backerAddress: body.backerAddress,
      visibility: body.visibility as never,
      showAmount: body.showAmount,
      allowFeaturing: body.allowFeaturing,
    });

    return NextResponse.json(
      { success: true, preference, removedFromFeatured },
      { headers: NO_STORE },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid privacy payload" },
      { status: 400, headers: NO_STORE },
    );
  }
}
