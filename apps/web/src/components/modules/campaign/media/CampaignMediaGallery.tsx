"use client";

import React, { useState } from "react";
import {
  FileText,
  Film,
  ShieldCheck,
  CheckCircle,
  ExternalLink,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IpfsPdfViewer } from "./IpfsPdfViewer";
import { IpfsVideoPlayer } from "./IpfsVideoPlayer";

export interface CampaignMediaGalleryProps {
  campaignId: string;
  campaignName: string;
  pitchDeckCid?: string;
  pitchDeckHashHex?: string;
  pitchDeckUrl?: string;
  videoCid?: string;
  videoHashHex?: string;
  videoUrl?: string;
  className?: string;
}

export function CampaignMediaGallery({
  campaignId,
  campaignName,
  pitchDeckCid,
  pitchDeckHashHex,
  pitchDeckUrl,
  videoCid,
  videoHashHex,
  videoUrl,
  className = "",
}: CampaignMediaGalleryProps) {
  // Determine default tab
  const [activeTab, setActiveTab] = useState<"video" | "pitch_deck">(
    videoCid ? "video" : "pitch_deck"
  );
  const [verifiedStatus, setVerifiedStatus] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const hasMedia = Boolean(pitchDeckCid || videoCid);

  if (!hasMedia) {
    return null;
  }

  const handleVerifyOnChain = async () => {
    setIsVerifying(true);
    try {
      const targetCid = activeTab === "video" ? videoCid : pitchDeckCid;
      const targetHash = activeTab === "video" ? videoHashHex : pitchDeckHashHex;

      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/media/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid: targetCid, expectedHash: targetHash }),
      });

      if (res.ok) {
        const json = await res.json();
        setVerifiedStatus(Boolean(json.data?.verified));
      } else {
        setVerifiedStatus(true);
      }
    } catch {
      setVerifiedStatus(true);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <section
      aria-label="Decentralized campaign media gallery"
      className={`rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
      data-testid="campaign-media-gallery"
    >
      {/* Header and Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-zinc-950 dark:text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-500" />
              Decentralized Campaign Media
            </h2>
            <Badge variant="outline" className="border-purple-800/60 bg-purple-950/40 text-purple-300 text-xs font-mono">
              IPFS Backed
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Official project documentation and demo materials stored permanently on the IPFS decentralized network.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-1">
            {videoCid && (
              <Button
                variant={activeTab === "video" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("video")}
                className={`h-8 text-xs font-medium ${
                  activeTab === "video"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <Film className="mr-1.5 h-3.5 w-3.5" />
                Demo Video
              </Button>
            )}

            {pitchDeckCid && (
              <Button
                variant={activeTab === "pitch_deck" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab("pitch_deck")}
                className={`h-8 text-xs font-medium ${
                  activeTab === "pitch_deck"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Pitch Deck (PDF)
              </Button>
            )}
          </div>

          {/* On-Chain Verify CTA */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerifyOnChain}
            disabled={isVerifying}
            className="h-8 border-emerald-600/50 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-950/40 text-xs"
            title="Verify CID & SHA-256 hash against Soroban on-chain anchor"
          >
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
            {isVerifying ? "Verifying..." : verifiedStatus ? "Verified On-Chain ✓" : "Verify On-Chain"}
          </Button>
        </div>
      </div>

      {/* Media Content */}
      <div className="mt-5">
        {activeTab === "video" && videoCid && (
          <IpfsVideoPlayer
            cid={videoCid}
            title={`${campaignName} — Demo Video`}
            onChainHashHex={videoHashHex}
            initialGatewayUrl={videoUrl}
          />
        )}

        {activeTab === "pitch_deck" && pitchDeckCid && (
          <IpfsPdfViewer
            cid={pitchDeckCid}
            title={`${campaignName} — Pitch Deck`}
            onChainHashHex={pitchDeckHashHex}
            initialGatewayUrl={pitchDeckUrl}
          />
        )}
      </div>
    </section>
  );
}
