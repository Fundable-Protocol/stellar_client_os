import { NextResponse } from "next/server";
import { buildAssetLinks, getDeepLinkConfig } from "@/lib/deep-links";

export const dynamic = "force-static";

/** Android App Links Digital Asset Links file. */
export function GET() {
  return NextResponse.json(buildAssetLinks(getDeepLinkConfig()), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
