import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignSideBySideComparison } from "@/components/modules/campaign/campaign-side-by-side-comparison";

/**
 * Campaign comparison — side-by-side details (issue #929).
 *
 * `?ids=1,2,4` opens the page with those campaigns already selected, so a
 * comparison can be shared as a link.
 */
export default async function CampaignSideBySidePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { ids } = await searchParams;
  const initialIds = (Array.isArray(ids) ? ids.join(",") : ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <Link href="/campaigns/compare">
        <Button variant="ghost" size="sm" className="mb-2 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to comparison tool
        </Button>
      </Link>
      <CampaignSideBySideComparison initialIds={initialIds} />
    </div>
  );
}
