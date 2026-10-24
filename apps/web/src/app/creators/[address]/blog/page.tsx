import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CreatorBlogFeed } from "@/components/creator/CreatorBlogFeed";
import { CreatorProfileHeader } from "@/components/creator/CreatorProfileHeader";
import { getCreatorStats } from "@/services/creator-stats.service";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreatorBlogPageProps {
  params: Promise<{
    address: string;
  }>;
}

export async function generateMetadata({ params }: CreatorBlogPageProps) {
  const { address } = await params;

  return {
    title: `${address.slice(0, 8)}... - Creator Blog | Fundable`,
    description: `Read updates and insights from creator ${address}`,
  };
}

async function CreatorBlogContent({ address }: { address: string }) {
  try {
    const stats = await getCreatorStats(address);

    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Back to profile link */}
          <Link
            href={`/creators/${address}`}
            className="inline-flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Creator Profile
          </Link>

          {/* Header with creator info */}
          <div className="mb-8">
            <CreatorProfileHeader address={address} stats={stats} />
          </div>

          {/* Blog Feed */}
          <CreatorBlogFeed creatorAddress={address} />
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error loading creator blog:", error);
    notFound();
  }
}

function LoadingCreatorBlog() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
          <div className="h-12 bg-gray-200 rounded w-1/3 mb-12"></div>
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function CreatorBlogPage({ params }: CreatorBlogPageProps) {
  const { address } = await params;

  if (!address || address.length < 10) {
    notFound();
  }

  return (
    <Suspense fallback={<LoadingCreatorBlog />}>
      <CreatorBlogContent address={address} />
    </Suspense>
  );
}
