import { NextResponse } from "next/server";
import {
  buildAppleAppSiteAssociation,
  getDeepLinkConfig,
} from "@/lib/deep-links";

export const dynamic = "force-static";

/** iOS Universal Links association file. Must be served as JSON without redirects. */
export function GET() {
  return NextResponse.json(buildAppleAppSiteAssociation(getDeepLinkConfig()), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
