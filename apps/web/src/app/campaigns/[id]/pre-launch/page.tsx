import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Rocket,
  ShieldCheck,
  Calendar,
  Layers,
  FileText,
  Film,
  Users,
} from "lucide-react";
import { getCampaign } from "@/services/campaign.service";
import { campaignPrelaunchService } from "@/services/campaign-prelaunch.service";
import { PreLaunchWaitlistCard } from "@/components/modules/campaign/prelaunch/PreLaunchWaitlistCard";
import { IpfsVideoPlayer } from "@/components/modules/campaign/media/IpfsVideoPlayer";
import { IpfsPdfViewer } from "@/components/modules/campaign/media/IpfsPdfViewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const runtime = "nodejs";

export default async function CampaignPreLaunchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);

  if (!campaign) {
    notFound();
  }

  const waitlistStats = campaignPrelaunchService.getStats(id);
  const campaignRecord = campaign as unknown as Record<string, unknown>;

  // Check for IPFS media
  const teaserVideoCid = (campaignRecord.preLaunchTeaserVideoCid || campaignRecord.videoCid) as string | undefined;
  const teaserVideoHashHex = (campaignRecord.videoHashHex) as string | undefined;
  const teaserVideoUrl = (campaignRecord.videoUrl) as string | undefined;

  const pitchDeckCid = (campaignRecord.preLaunchPitchDeckCid || campaignRecord.pitchDeckCid) as string | undefined;
  const pitchDeckHashHex = (campaignRecord.pitchDeckHashHex) as string | undefined;
  const pitchDeckUrl = (campaignRecord.pitchDeckUrl) as string | undefined;

  const teaserSummary = (campaignRecord.preLaunchSummary || campaign.description) as string | undefined;
  const expectedDate = (campaignRecord.preLaunchExpectedDate) as string | undefined;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-purple-500 selection:text-white">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-purple-900/15 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-[400px] w-[400px] rounded-full bg-blue-900/10 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 space-y-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href={`/campaigns/${encodeURIComponent(campaign.id)}`}
            className="inline-flex items-center text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to Campaign Details
          </Link>

          <Badge variant="outline" className="border-purple-600/40 bg-purple-950/30 text-purple-300 text-xs">
            <span className="mr-1.5 h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
            Coming Soon / Pre-Launch
          </Badge>
        </div>

        {/* Hero Section */}
        <header className="space-y-4 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/50 px-4 py-1.5 text-xs font-semibold text-purple-200 backdrop-blur-md">
            <Rocket className="h-4 w-4 text-purple-400" />
            Official Campaign Teaser & Early Backer Waitlist
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            {campaign.name}
          </h1>

          {campaign.category && (
            <div className="flex justify-center">
              <Badge variant="outline" className="border-zinc-700 bg-zinc-900/80 text-zinc-300 text-xs">
                {String(campaign.category)}
              </Badge>
            </div>
          )}

          {teaserSummary && (
            <p className="text-base sm:text-lg text-zinc-300 leading-relaxed max-w-2xl mx-auto">
              {teaserSummary}
            </p>
          )}

          {/* Quick Meta Stats */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-2 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-purple-400" />
              <span>Creator: <strong className="text-zinc-200 font-mono">{campaign.creator.slice(0, 6)}...{campaign.creator.slice(-4)}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span>Target: <strong className="text-zinc-200">{campaign.goalAmount} XLM</strong></span>
            </div>
            {expectedDate && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-400" />
                <span>Expected Launch: <strong className="text-zinc-200">{expectedDate}</strong></span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Censorship-Resistant IPFS Media</span>
            </div>
          </div>
        </header>

        {/* Primary Waitlist Signup Component with Social Proof */}
        <section aria-label="Subscriber waitlist signup">
          <PreLaunchWaitlistCard
            campaignId={campaign.id}
            campaignName={campaign.name}
            initialFollowerCount={waitlistStats.subscriberCount}
            targetFollowers={waitlistStats.targetSubscribers}
          />
        </section>

        {/* Teaser Video streaming directly from IPFS */}
        {teaserVideoCid && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Film className="h-5 w-5 text-purple-400" />
                Campaign Teaser & Demo Video
              </h2>
              <span className="text-xs text-zinc-400 font-mono">Streamed from IPFS Gateway</span>
            </div>
            <IpfsVideoPlayer
              cid={teaserVideoCid}
              title={`${campaign.name} — Teaser`}
              onChainHashHex={teaserVideoHashHex}
              initialGatewayUrl={teaserVideoUrl}
            />
          </section>
        )}

        {/* Pitch Deck Preview streaming directly from IPFS */}
        {pitchDeckCid && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-400" />
                Whitepaper & Pitch Deck
              </h2>
              <span className="text-xs text-zinc-400 font-mono">Decentralized PDF</span>
            </div>
            <IpfsPdfViewer
              cid={pitchDeckCid}
              title={`${campaign.name} — Pitch Deck`}
              onChainHashHex={pitchDeckHashHex}
              initialGatewayUrl={pitchDeckUrl}
            />
          </section>
        )}

        {/* Creator Admin Broadcast Panel (Visible to facilitate testing and transitions) */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Rocket className="h-4 w-4 text-purple-400" />
              Creator Launch Controls
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Ready to begin fundraising? Transitioning this campaign to Active will automatically dispatch launch emails and push alerts to all {waitlistStats.subscriberCount} followers.
            </p>
          </div>

          <form action={`/api/campaigns/${encodeURIComponent(campaign.id)}/launch`} method="POST">
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-500 font-semibold text-white shadow-lg shadow-purple-900/30"
            >
              <Rocket className="mr-2 h-4 w-4" />
              Launch Campaign & Broadcast
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
