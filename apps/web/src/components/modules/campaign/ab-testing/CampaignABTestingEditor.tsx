"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Lock,
  Unlock,
  TrendingUp,
  Percent,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Type,
  MousePointerClick,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ABTestConfig,
  TrafficSplit,
  WinnerSelectionMode,
} from "@/types/campaign-ab-testing";
import { campaignABTestingService } from "@/services/campaign-ab-testing.service";

export interface CampaignABTestingEditorProps {
  initialConfig?: ABTestConfig;
  campaignId: string;
  defaultHeadline?: string;
  defaultHeroImageUrl?: string;
  defaultCtaText?: string;
  onSave?: (config: ABTestConfig) => void;
}

export function CampaignABTestingEditor({
  initialConfig,
  campaignId,
  defaultHeadline = "Support Our Green Future",
  defaultHeroImageUrl = "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&auto=format&fit=crop&q=60",
  defaultCtaText = "Back This Campaign",
  onSave,
}: CampaignABTestingEditorProps) {
  const [isEnabled, setIsEnabled] = useState(Boolean(initialConfig));

  // Initialize or retrieve active test configuration
  const [config, setConfig] = useState<ABTestConfig>(() => {
    if (initialConfig) return initialConfig;

    return campaignABTestingService.createTest({
      campaignId,
      variants: [
        {
          name: "Variant A (Control)",
          headline: defaultHeadline,
          heroImageUrl: defaultHeroImageUrl,
          ctaText: defaultCtaText,
        },
        {
          name: "Variant B (Challenger)",
          headline: defaultHeadline ? `${defaultHeadline} - Join Us Today` : "Empower Real Climate Action",
          heroImageUrl: defaultHeroImageUrl,
          ctaText: "Pledge Now & Save Forests",
        },
      ],
      winnerSelectionMode: "significance",
      significanceThreshold: 0.95,
      minSampleSize: 100,
    });
  });

  const [activePreviewVariantId, setActivePreviewVariantId] = useState<string>(
    config.variants[0]?.id || ""
  );

  const significanceResult = campaignABTestingService.evaluateSignificance(config.id);

  // Update variant field
  const handleUpdateVariant = (
    variantId: string,
    field: "headline" | "heroImageUrl" | "ctaText",
    value: string
  ) => {
    const updatedVariants = config.variants.map((v) =>
      v.id === variantId ? { ...v, [field]: value } : v
    );
    const updatedConfig = { ...config, variants: updatedVariants, updatedAt: new Date().toISOString() };
    setConfig(updatedConfig);
    onSave?.(updatedConfig);
  };

  // Update traffic split
  const handleSplitChange = (variantId: string, value: number) => {
    if (config.variants.length === 2) {
      const otherVariant = config.variants.find((v) => v.id !== variantId);
      if (otherVariant) {
        const clamped = Math.max(0, Math.min(100, value));
        const newSplit: TrafficSplit = {
          [variantId]: clamped,
          [otherVariant.id]: 100 - clamped,
        };
        const updated = campaignABTestingService.updateTrafficSplit(config.id, newSplit);
        setConfig({ ...updated });
        onSave?.(updated);
        return;
      }
    }

    const newSplit = { ...config.trafficSplit, [variantId]: value };
    try {
      const updated = campaignABTestingService.updateTrafficSplit(config.id, newSplit);
      setConfig({ ...updated });
      onSave?.(updated);
    } catch {
      // Allow user typing without breaking state
      setConfig((prev) => ({ ...prev, trafficSplit: newSplit }));
    }
  };

  // Reset traffic split to default 50/50
  const handleResetTo5050 = () => {
    const variantIds = config.variants.map((v) => v.id);
    const defaultSplit = campaignABTestingService.generateDefaultSplit(variantIds);
    const updated = campaignABTestingService.updateTrafficSplit(config.id, defaultSplit);
    setConfig({ ...updated });
    onSave?.(updated);
  };

  // Toggle winner selection mode
  const handleSelectionModeChange = (mode: WinnerSelectionMode) => {
    const updated = campaignABTestingService.setWinnerSelectionMode(config.id, mode);
    setConfig({ ...updated });
    onSave?.(updated);
  };

  // Lock winner manually
  const handleLockWinner = (variantId: string) => {
    const updated = campaignABTestingService.lockWinner(config.id, variantId);
    setConfig({ ...updated });
    onSave?.(updated);
  };

  // Unlock winner
  const handleUnlockWinner = () => {
    const updated = campaignABTestingService.unlockWinner(config.id);
    setConfig({ ...updated });
    onSave?.(updated);
  };

  const isSplitValid = campaignABTestingService.validateTrafficSplit(
    config.trafficSplit,
    config.variants.map((v) => v.id)
  );

  const activePreviewVariant =
    config.variants.find((v) => v.id === activePreviewVariantId) || config.variants[0];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <h3 className="text-xl font-bold tracking-tight text-white">Campaign A/B Testing</h3>
            <Badge
              variant="outline"
              className={
                config.lockedWinnerId
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                  : isEnabled
                  ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400"
              }
            >
              {config.lockedWinnerId ? "Winner Locked" : isEnabled ? "Testing Active" : "Disabled"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            A/B test your campaign headlines, hero imagery, and CTA text to identify which variant drives higher conversion.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={isEnabled ? "default" : "outline"}
            size="sm"
            onClick={() => setIsEnabled(!isEnabled)}
            className={
              isEnabled
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }
          >
            {isEnabled ? "A/B Testing Enabled" : "Enable A/B Testing"}
          </Button>
        </div>
      </div>

      {isEnabled && (
        <div className="space-y-6">
          {/* Winner Banner if locked */}
          {config.lockedWinnerId && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-4 text-emerald-300">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-200">
                    Winning Variant Locked In:{" "}
                    {config.variants.find((v) => v.id === config.lockedWinnerId)?.name}
                  </div>
                  <p className="text-xs text-emerald-400/90 mt-0.5">
                    100% of incoming visitors are now receiving this highest-converting variant.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUnlockWinner}
                className="border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40"
              >
                <Unlock className="h-3.5 w-3.5 mr-1.5" /> Unlock & Resume Test
              </Button>
            </div>
          )}

          {/* Winner Selection & Auto-Significance Settings */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-zinc-400" />
                  Winner Selection Method
                </Label>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Choose whether the system should automatically crown a winner by statistical significance or let you lock it in manually.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={config.winnerSelectionMode === "significance" ? "default" : "outline"}
                  onClick={() => handleSelectionModeChange("significance")}
                  className={
                    config.winnerSelectionMode === "significance"
                      ? "bg-purple-600 hover:bg-purple-500 text-white"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }
                >
                  Auto by Significance (95%)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={config.winnerSelectionMode === "manual" ? "default" : "outline"}
                  onClick={() => handleSelectionModeChange("manual")}
                  className={
                    config.winnerSelectionMode === "manual"
                      ? "bg-purple-600 hover:bg-purple-500 text-white"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }
                >
                  Manual Selection
                </Button>
              </div>
            </div>

            {/* Significance & Performance Status */}
            <div className="pt-3 border-t border-zinc-800/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-zinc-300 font-medium">Statistical Significance:</span>
                <span className="text-zinc-400">{significanceResult.recommendation}</span>
              </div>
              <div className="flex items-center gap-3 text-zinc-400">
                <span>Confidence: <strong className="text-zinc-200">{(significanceResult.confidence * 100).toFixed(1)}%</strong></span>
                <span>p-value: <strong className="text-zinc-200">{significanceResult.pValue.toFixed(4)}</strong></span>
              </div>
            </div>
          </div>

          {/* Traffic Split Controls */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Percent className="h-4 w-4 text-blue-400" />
                  Traffic Allocation Split
                </Label>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Configured traffic split (defaults to 50/50).
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetTo5050}
                className="text-xs text-zinc-400 hover:text-zinc-100 flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" /> Reset 50/50
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {config.variants.map((variant) => {
                const percentage = config.trafficSplit[variant.id] ?? 50;
                return (
                  <div key={variant.id} className="space-y-1.5 bg-zinc-900/60 p-3 rounded-md border border-zinc-800">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-zinc-200">{variant.name}</span>
                      <span className="font-bold text-emerald-400">{percentage}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={percentage}
                      onChange={(e) => handleSplitChange(variant.id, Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>

            {!isSplitValid && (
              <p className="text-xs text-amber-400 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Traffic allocation must sum up to exactly 100%.
              </p>
            )}
          </div>

          {/* Variant Setup Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {config.variants.map((variant) => {
              const isWinner = config.lockedWinnerId === variant.id;
              const conversionRate = campaignABTestingService.getConversionRate(variant);

              return (
                <div
                  key={variant.id}
                  className={`rounded-xl border p-5 space-y-4 transition-all ${
                    isWinner
                      ? "border-emerald-500 bg-emerald-950/10 shadow-lg shadow-emerald-950/20"
                      : "border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-100">{variant.name}</span>
                      {isWinner && (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs">
                          ★ Locked Winner
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={activePreviewVariantId === variant.id ? "secondary" : "ghost"}
                        onClick={() => setActivePreviewVariantId(variant.id)}
                        className="text-xs"
                      >
                        Preview
                      </Button>

                      {isWinner ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleUnlockWinner}
                          className="text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-950"
                        >
                          <Unlock className="h-3 w-3 mr-1" /> Unlock
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleLockWinner(variant.id)}
                          className="text-xs border-zinc-700 text-zinc-200 hover:border-emerald-500 hover:text-emerald-400"
                        >
                          <Lock className="h-3 w-3 mr-1" /> Lock in as Winner
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Metrics bar */}
                  <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-lg bg-zinc-950/70 border border-zinc-800/80 text-center text-xs">
                    <div>
                      <div className="text-zinc-400">Impressions</div>
                      <div className="text-sm font-semibold text-zinc-200 mt-0.5">{variant.impressions}</div>
                    </div>
                    <div>
                      <div className="text-zinc-400">Conversions</div>
                      <div className="text-sm font-semibold text-zinc-200 mt-0.5">{variant.conversions}</div>
                    </div>
                    <div>
                      <div className="text-zinc-400">Conversion Rate</div>
                      <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                        {(conversionRate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-zinc-300 flex items-center gap-1 mb-1">
                        <Type className="h-3.5 w-3.5 text-zinc-400" />
                        Campaign Headline
                      </Label>
                      <Input
                        value={variant.headline}
                        onChange={(e) => handleUpdateVariant(variant.id, "headline", e.target.value)}
                        placeholder="Variant headline / title"
                        className="border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-zinc-300 flex items-center gap-1 mb-1">
                        <ImageIcon className="h-3.5 w-3.5 text-zinc-400" />
                        Hero Image URL
                      </Label>
                      <Input
                        value={variant.heroImageUrl}
                        onChange={(e) => handleUpdateVariant(variant.id, "heroImageUrl", e.target.value)}
                        placeholder="https://example.com/hero.jpg"
                        className="border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-zinc-300 flex items-center gap-1 mb-1">
                        <MousePointerClick className="h-3.5 w-3.5 text-zinc-400" />
                        Call-to-Action (CTA) Button Text
                      </Label>
                      <Input
                        value={variant.ctaText}
                        onChange={(e) => handleUpdateVariant(variant.id, "ctaText", e.target.value)}
                        placeholder="Back This Project"
                        className="border-zinc-700 bg-zinc-900 text-sm text-zinc-100"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Visitor Preview */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-zinc-200">
                Live Visitor Experience Preview ({activePreviewVariant.name})
              </h4>
              <div className="flex items-center gap-2">
                {config.variants.map((v) => (
                  <Button
                    key={v.id}
                    type="button"
                    size="sm"
                    variant={activePreviewVariantId === v.id ? "default" : "outline"}
                    onClick={() => setActivePreviewVariantId(v.id)}
                    className={`text-xs ${
                      activePreviewVariantId === v.id
                        ? "bg-zinc-700 text-white"
                        : "border-zinc-800 text-zinc-400"
                    }`}
                  >
                    {v.name}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
              <div className="relative h-48 w-full bg-zinc-900">
                {activePreviewVariant.heroImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activePreviewVariant.heroImageUrl}
                    alt={activePreviewVariant.headline}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    No hero image specified
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <h2 className="text-xl md:text-2xl font-extrabold text-white">
                    {activePreviewVariant.headline || "Headline variant preview"}
                  </h2>
                </div>
              </div>

              <div className="p-4 flex items-center justify-between bg-zinc-900/80">
                <span className="text-xs text-zinc-400">
                  Visitor views this variant based on your configured traffic split ({config.trafficSplit[activePreviewVariant.id] ?? 50}%).
                </span>
                <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4">
                  {activePreviewVariant.ctaText || "Back This Campaign"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
