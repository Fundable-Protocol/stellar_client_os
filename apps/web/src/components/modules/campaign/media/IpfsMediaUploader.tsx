"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CampaignMediaAsset, CampaignMediaAssetType } from "@/types/campaign-media";

export interface IpfsMediaUploaderProps {
  campaignId?: string;
  type: CampaignMediaAssetType;
  title: string;
  description: string;
  accept: string;
  maxSizeBytes?: number;
  initialCid?: string;
  initialHashHex?: string;
  onUploaded: (asset: CampaignMediaAsset) => void;
  className?: string;
}

export function IpfsMediaUploader({
  campaignId,
  type,
  title,
  description,
  accept,
  maxSizeBytes = 100 * 1024 * 1024, // 100MB default
  initialCid,
  initialHashHex,
  onUploaded,
  className = "",
}: IpfsMediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentCid, setCurrentCid] = useState<string | undefined>(initialCid);
  const [currentHashHex, setCurrentHashHex] = useState<string | undefined>(initialHashHex);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeBytes) {
      setError(`File size exceeds maximum allowed (${Math.round(maxSizeBytes / (1024 * 1024))}MB)`);
      return;
    }

    setError(null);
    setIsUploading(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      if (campaignId) formData.append("campaignId", campaignId);
      formData.append("name", file.name);

      const response = await fetch("/api/campaigns/media/ipfs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload to IPFS");
      }

      const { data: asset } = (await response.json()) as { data: CampaignMediaAsset };
      setCurrentCid(asset.cid);
      setCurrentHashHex(asset.onChainHashHex);
      onUploaded(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Media upload to IPFS failed");
    } finally {
      setIsUploading(false);
    }
  };

  const copyCid = () => {
    if (!currentCid) return;
    navigator.clipboard.writeText(currentCid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            {type === "video" || type === "teaser_video" ? (
              <Film className="h-5 w-5" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
            <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
          </div>
        </div>

        <Badge variant="outline" className="border-purple-800/60 bg-purple-950/40 text-purple-300 text-[10px]">
          IPFS Storage
        </Badge>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Upload Box */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 p-6 text-center cursor-pointer transition-colors hover:border-purple-500/60 hover:bg-zinc-950"
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
            <p className="text-xs font-medium text-zinc-200">
              Pinning to Decentralized IPFS & Generating On-Chain Multi-hash...
            </p>
            <p className="text-[11px] text-zinc-500">{fileName}</p>
          </div>
        ) : currentCid ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            <p className="text-xs font-semibold text-zinc-100">
              Asset Successfully Pinned on IPFS
            </p>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
              <span>CID: {currentCid.slice(0, 16)}...{currentCid.slice(-8)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copyCid();
                }}
                className="hover:text-zinc-200"
                title="Copy CID"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="mt-1 h-7 border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              Replace Asset
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <UploadCloud className="h-8 w-8 text-zinc-500 group-hover:text-purple-400 transition-colors" />
            <p className="text-xs font-medium text-zinc-200">
              Click to select or drag and drop your {type === "video" ? "video file" : "PDF document"}
            </p>
            <p className="text-[11px] text-zinc-500">
              Files are automatically pinned to IPFS nodes with global CDN failover
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-rose-950/40 border border-rose-900/50 p-2.5 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {currentHashHex && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-800/80 pt-2 font-mono">
          <span>On-Chain Hash: {currentHashHex.slice(0, 18)}...</span>
          <span className="text-emerald-400">✓ Cryptographically Anchored</span>
        </div>
      )}
    </div>
  );
}
