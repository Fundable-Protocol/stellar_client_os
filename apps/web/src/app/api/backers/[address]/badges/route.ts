import { backerBadgeService } from "@/services/backer-badge.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const viewer = new URL(request.url).searchParams.get("viewer") ?? undefined;
  const profile = backerBadgeService.getProfile(address, viewer);
  if (profile.hidden) {
    return Response.json({ error: "This backer profile is private.", hidden: true }, { status: 403, headers: NO_STORE });
  }
  return Response.json(profile, { headers: NO_STORE });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  try {
    const body = (await request.json()) as {
      viewerAddress?: string;
      showBadgeShowcase?: boolean;
      profilePrivate?: boolean;
    };
    const viewer = body.viewerAddress?.trim();
    if (!viewer || viewer.trim().toLowerCase() !== address.trim().toLowerCase()) {
      return Response.json({ error: "Only the profile owner can update badge privacy." }, { status: 403, headers: NO_STORE });
    }
    const privacy = backerBadgeService.setPrivacy(address, {
      showBadgeShowcase: body.showBadgeShowcase,
      profilePrivate: body.profilePrivate,
    });
    const profile = backerBadgeService.getProfile(address, viewer);
    return Response.json({ privacy, profile }, { headers: NO_STORE });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid privacy payload" },
      { status: 400, headers: NO_STORE },
    );
  }
}
