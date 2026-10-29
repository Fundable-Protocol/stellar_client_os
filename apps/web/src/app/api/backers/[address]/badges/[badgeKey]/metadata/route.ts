import { backerBadgeService, type BackerBadgeKey } from "@/services/backer-badge.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BADGE_KEYS = new Set<BackerBadgeKey>([
  "FIRST_PLEDGE",
  "FIVE_CAMPAIGNS",
  "TEN_CAMPAIGNS",
  "EARLY_BIRD",
  "TOP_SUPPORTER",
  "MILESTONE_VERIFIER",
  "FIRST_100_BACKERS",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string; badgeKey: string }> },
) {
  const { address, badgeKey } = await params;
  if (!BADGE_KEYS.has(badgeKey as BackerBadgeKey)) {
    return Response.json({ error: "Unknown badge key" }, { status: 404 });
  }
  const metadata = backerBadgeService.getBadgeMetadata(address, badgeKey as BackerBadgeKey);
  if (!metadata) {
    return Response.json({ error: "Badge not minted for this backer" }, { status: 404 });
  }
  return Response.json(metadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
