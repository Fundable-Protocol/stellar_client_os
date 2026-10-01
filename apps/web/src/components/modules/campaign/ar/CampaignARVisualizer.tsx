"use client";

import React, { useState, useMemo } from "react";
import {
  Camera,
  Compass,
  Download,
  Info,
  Layers,
  RefreshCw,
  TreePine,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useARCamera } from "@/hooks/use-ar-camera";
import {
  getTreeGrowthStageData,
  getTreeProfile,
  type TreeGrowthTimeline,
} from "@/lib/tree-growth";
import { TreeModelAROverlay } from "./TreeModelAROverlay";
import { TreeGrowthTimelineControls } from "./TreeGrowthTimelineControls";

export interface CampaignARVisualizerProps {
  campaignId: string;
  campaignTitle: string;
  treeType?: string;
  treesPlanted?: string | number;
  location?: string;
  onClose?: () => void;
  className?: string;
}

export const CampaignARVisualizer: React.FC<CampaignARVisualizerProps> = ({
  campaignId,
  campaignTitle,
  treeType = "Oak",
  treesPlanted = 1,
  location,
  onClose,
  className = "",
}) => {
  const [timeline, setTimeline] = useState<TreeGrowthTimeline>("10yr");
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 50, y: 72 });
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1.0);
  const [showReticle, setShowReticle] = useState<boolean>(true);
  const [forceStudioMode, setForceStudioMode] = useState<boolean>(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);

  const parsedTrees = typeof treesPlanted === "number" ? treesPlanted : parseInt(String(treesPlanted).replace(/,/g, ""), 10) || 1;

  const {
    videoRef,
    flipCamera,
    hasMultipleCameras,
    captureSnapshot,
    isActive,
    isFallback,
  } = useARCamera({ autoStart: !forceStudioMode });

  const profile = useMemo(() => getTreeProfile(treeType), [treeType]);
  const metrics = useMemo(
    () => getTreeGrowthStageData(treeType, timeline, parsedTrees),
    [treeType, timeline, parsedTrees]
  );

  const isLiveCamera = isActive && !forceStudioMode;

  const handleCapture = () => {
    const dataUrl = captureSnapshot();
    if (dataUrl) {
      setSnapshotUrl(dataUrl);
    }
  };

  const downloadSnapshot = () => {
    if (!snapshotUrl) return;
    const a = document.createElement("a");
    a.href = snapshotUrl;
    a.download = `fundable-ar-${campaignId}-${treeType.toLowerCase()}-${timeline}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-black text-white select-none overflow-hidden ${className}`}
      data-testid="campaign-ar-visualizer"
    >
      {/* Background: Either live camera feed or simulated Nature Studio */}
      <div className="absolute inset-0 z-0">
        {/* HTML5 Live Video Element */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            isLiveCamera ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          data-testid="ar-camera-video"
        />

        {/* Nature Studio Simulator Backdrop (when camera unavailable or studio mode) */}
        {!isLiveCamera && (
          <div
            className="absolute inset-0 bg-gradient-to-b from-sky-950 via-slate-900 to-emerald-950"
            data-testid="ar-studio-backdrop"
          >
            {/* Horizon and grid lines for perspective */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-950 via-zinc-900/90 to-transparent">
              <div
                className="w-full h-full opacity-20"
                style={{
                  backgroundImage:
                    "radial-gradient(#10b981 1px, transparent 1px), linear-gradient(to right, rgba(16,185,129,0.1) 1px, transparent 1px)",
                  backgroundSize: "40px 40px, 80px 80px",
                }}
              />
            </div>
            {/* Ambient sun glow */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          </div>
        )}
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent backdrop-blur-xs">
        <div className="flex items-center gap-2.5 max-w-[70%]">
          {onClose && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 w-9 p-0 rounded-full border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:text-white"
              aria-label="Exit AR visualizer"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          <div className="truncate">
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-600/90 text-white text-[11px] font-semibold">
                <TreePine className="mr-1 h-3 w-3" /> {profile.name}
              </Badge>
              {location && (
                <span className="hidden sm:inline-flex text-[11px] text-zinc-400 truncate">
                  {location}
                </span>
              )}
            </div>
            <p className="text-xs font-semibold text-zinc-200 truncate mt-0.5">
              {campaignTitle}
            </p>
          </div>
        </div>

        {/* Action Controls Top Right */}
        <div className="flex items-center gap-2">
          {/* Studio / Camera Toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setForceStudioMode(!forceStudioMode)}
            className="h-9 px-2.5 text-xs rounded-full border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:text-white"
            title={forceStudioMode ? "Switch to Camera Feed" : "Switch to 3D Simulator"}
          >
            {forceStudioMode ? (
              <>
                <Video className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                <span className="hidden xs:inline">AR Live</span>
              </>
            ) : (
              <>
                <Layers className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                <span className="hidden xs:inline">Studio</span>
              </>
            )}
          </Button>

          {/* Flip Camera if live */}
          {isLiveCamera && hasMultipleCameras && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={flipCamera}
              className="h-9 w-9 p-0 rounded-full border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:text-white"
              title="Flip camera"
              aria-label="Flip camera"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}

          {/* Info Modal Trigger */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowInfoModal(true)}
            className="h-9 w-9 p-0 rounded-full border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:text-white"
            title="Tree Species Details"
            aria-label="Tree species details"
          >
            <Info className="h-4 w-4" />
          </Button>

          {/* Snapshot Trigger */}
          <Button
            type="button"
            size="sm"
            onClick={handleCapture}
            className="h-9 px-3 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold text-xs shadow-lg hover:from-emerald-700 hover:to-teal-700"
            title="Capture AR photo"
          >
            <Camera className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Snapshot</span>
          </Button>
        </div>
      </header>

      {/* Environmental Status Banner if in simulator / fallback */}
      {!isLiveCamera && (
        <div className="relative z-20 mx-auto mt-2 max-w-md px-4">
          <div className="flex items-center justify-between rounded-full border border-amber-500/40 bg-zinc-950/80 px-3 py-1.5 backdrop-blur-md">
            <span className="text-[11px] text-amber-300 flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5" />
              {isFallback ? "Camera unavailable: 3D AR Studio active" : "3D AR Studio Mode"}
            </span>
            <span className="text-[10px] text-zinc-400">Tap screen to reposition</span>
          </div>
        </div>
      )}

      {/* Main AR Canvas Area */}
      <main className="relative flex-1 w-full overflow-hidden">
        <TreeModelAROverlay
          metrics={metrics}
          treeType={treeType}
          position={position}
          scaleMultiplier={scaleMultiplier}
          showReticle={showReticle}
          onPositionChange={setPosition}
        />
      </main>

      {/* Bottom Timeline Controls */}
      <footer className="relative z-30 p-4 pb-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent backdrop-blur-xs">
        <TreeGrowthTimelineControls
          currentTimeline={timeline}
          metrics={metrics}
          scaleMultiplier={scaleMultiplier}
          showReticle={showReticle}
          onTimelineChange={setTimeline}
          onScaleChange={setScaleMultiplier}
          onToggleReticle={() => setShowReticle(!showReticle)}
        />
      </footer>

      {/* Snapshot Preview Dialog */}
      {snapshotUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Camera className="h-4 w-4 text-emerald-400" />
                AR Tree Snapshot
              </h3>
              <button
                type="button"
                onClick={() => setSnapshotUrl(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-zinc-800 bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={snapshotUrl}
                alt="AR Tree Snapshot"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-black/75 backdrop-blur-sm p-2 text-[11px] text-zinc-200">
                <p className="font-semibold text-emerald-300">{profile.name} · {metrics.label}</p>
                <p className="text-zinc-400">{campaignTitle} · {metrics.cumulativeCo2Kg}kg CO2 offset</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSnapshotUrl(null)}
                className="border-zinc-800 text-zinc-300 hover:bg-zinc-900"
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={downloadSnapshot}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Save Image
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">{profile.name}</h3>
                <p className="text-xs italic text-emerald-400">{profile.scientificName}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Native Habitat</span>
                <strong className="text-zinc-100">{profile.nativeRegion}</strong>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Growth Rate</span>
                <strong className="text-zinc-100 capitalize">{profile.growthRate}</strong>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Max Mature Height</span>
                <strong className="text-zinc-100">{profile.maxMaturityHeightMeters} meters</strong>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Canopy Spread</span>
                <strong className="text-zinc-100">{profile.maxCanopyDiameterMeters} meters</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Canopy Architecture</span>
                <strong className="text-zinc-100 capitalize">{profile.canopyShape} crown</strong>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-[11px] text-zinc-400">
              <p>
                AR tree projections simulate biological growth patterns over 5, 10, and 20 years.
                Carbon metrics are calculated in accordance with the Fundable protocol environmental SLA.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                size="sm"
                onClick={() => setShowInfoModal(false)}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
