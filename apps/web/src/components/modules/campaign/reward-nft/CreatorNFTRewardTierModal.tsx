"use client";

import React, { useState } from "react";
import { Upload, Sparkles, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NFTRewardTierItem } from "@/types/campaign-reward-nft";

interface CreatorNFTRewardTierModalProps {
  campaignId: string;
  creatorAddress: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (tier: NFTRewardTierItem) => void;
}

export function CreatorNFTRewardTierModal({
  campaignId,
  creatorAddress,
  isOpen,
  onClose,
  onCreated,
}: CreatorNFTRewardTierModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [minimumPledge, setMinimumPledge] = useState("100.00");
  const [symbol, setSymbol] = useState("");
  const [maxSupply, setMaxSupply] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState<number | undefined>();
  const [mimeType, setMimeType] = useState("image/png");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);
    setMimeType(file.type || "image/png");

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      setAssetUrl(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please provide a name for this NFT reward tier.");
      return;
    }

    if (!assetUrl.trim()) {
      setError("Please upload an artwork asset or provide an IPFS/HTTPS image URL.");
      return;
    }

    const pledge = parseFloat(minimumPledge);
    if (isNaN(pledge) || pledge <= 0) {
      setError("Minimum pledge must be a positive number.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/nft-rewards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorAddress,
          tier: {
            name: name.trim(),
            description: description.trim() || undefined,
            minimumPledge: pledge.toFixed(2),
            token: "USDC",
            symbol: symbol.trim() || undefined,
            maxSupply: maxSupply.trim() ? parseInt(maxSupply.trim(), 10) : undefined,
            asset: {
              assetUrl: assetUrl.trim(),
              fileName: fileName || undefined,
              fileSize,
              mimeType,
            },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create NFT reward tier");
      }

      onCreated(data.nftRewardTier);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reward tier");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-zinc-100">Create Stellar NFT Reward Tier</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <Label htmlFor="tier-name" className="text-xs text-zinc-300">
              Reward Tier Name <span className="text-rose-400">*</span>
            </Label>
            <Input
              id="tier-name"
              placeholder="e.g. Forest Pioneer Commemorative NFT"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 border-zinc-800 bg-zinc-900 text-sm text-zinc-100"
              required
            />
          </div>

          <div>
            <Label htmlFor="tier-desc" className="text-xs text-zinc-300">
              Description
            </Label>
            <Input
              id="tier-desc"
              placeholder="Short description of perks and significance"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 border-zinc-800 bg-zinc-900 text-sm text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="min-pledge" className="text-xs text-zinc-300">
                Minimum Pledge (USDC) <span className="text-rose-400">*</span>
              </Label>
              <Input
                id="min-pledge"
                type="number"
                step="0.01"
                min="1"
                value={minimumPledge}
                onChange={(e) => setMinimumPledge(e.target.value)}
                className="mt-1 border-zinc-800 bg-zinc-900 text-sm text-zinc-100"
                required
              />
            </div>
            <div>
              <Label htmlFor="max-supply" className="text-xs text-zinc-300">
                Supply Cap (Optional)
              </Label>
              <Input
                id="max-supply"
                type="number"
                placeholder="Unlimited"
                value={maxSupply}
                onChange={(e) => setMaxSupply(e.target.value)}
                className="mt-1 border-zinc-800 bg-zinc-900 text-sm text-zinc-100"
              />
            </div>
          </div>

          {/* Upload NFT Asset */}
          <div>
            <Label className="text-xs text-zinc-300">
              Upload NFT Artwork Asset <span className="text-rose-400">*</span>
            </Label>
            <div className="mt-1.5 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-4 text-center">
              {assetUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={assetUrl}
                    alt="NFT Preview"
                    className="h-24 w-24 rounded-lg object-cover shadow"
                  />
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {fileName || "Asset Uploaded"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAssetUrl("");
                      setFileName("");
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Change Artwork
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <Upload className="h-8 w-8 text-zinc-400 mb-1" />
                  <span className="text-xs font-medium text-zinc-200">
                    Click to upload image or drag and drop
                  </span>
                  <span className="text-[11px] text-zinc-500">PNG, JPG, SVG, WebP (Max 10MB)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <div className="mt-2">
              <Label htmlFor="asset-url-manual" className="text-[11px] text-zinc-400">
                Or enter direct IPFS / HTTPS Image URL
              </Label>
              <Input
                id="asset-url-manual"
                placeholder="ipfs://... or https://..."
                value={assetUrl.startsWith("data:") ? "" : assetUrl}
                onChange={(e) => setAssetUrl(e.target.value)}
                className="mt-1 border-zinc-800 bg-zinc-900 text-xs text-zinc-100"
              />
            </div>
          </div>

          <div className="rounded-lg border border-purple-900/40 bg-purple-950/20 p-3 text-xs text-purple-300 flex items-start gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
            <p>
              When the campaign completes or closes, eligible backers meeting this pledge threshold will automatically have their native Stellar NFT minted and airdropped to their connected wallet.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
              {isSubmitting ? "Creating Tier..." : "Define NFT Reward Tier"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
