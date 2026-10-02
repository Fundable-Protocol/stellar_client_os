"use client";

import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Check, Leaf, MapPin, ScanLine, Trees } from "lucide-react";

type TimelineYear = 5 | 10 | 20;

interface CampaignARViewerProps {
  treesPlanted: number;
  targetTrees: number;
  treeType: string;
  location: string;
}

const TIMELINE: Array<{ year: TimelineYear; label: string; factor: number; description: string }> = [
  { year: 5, label: "5 years", factor: 1, description: "Established grove" },
  { year: 10, label: "10 years", factor: 1.65, description: "Mature canopy" },
  { year: 20, label: "20 years", factor: 2.5, description: "Full forest impact" },
];

export default function CampaignARViewer({ treesPlanted, targetTrees, treeType, location }: CampaignARViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [selectedYear, setSelectedYear] = useState<TimelineYear>(5);
  const [cameraState, setCameraState] = useState<"preview" | "starting" | "active" | "denied">("preview");

  const timeline = TIMELINE.find((item) => item.year === selectedYear) ?? TIMELINE[0];
  const projectedTrees = Math.round(treesPlanted * timeline.factor);
  const canopyScale = 0.85 + (timeline.factor - 1) * 0.3;
  const visibleTrees = Math.min(18, Math.max(6, Math.round(projectedTrees / Math.max(1, targetTrees) * 18)));

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function toggleCamera() {
    if (cameraState === "active") {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraState("preview");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("denied");
      return;
    }

    setCameraState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState("active");
    } catch {
      setCameraState("denied");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-800/60 bg-zinc-950 shadow-2xl">
      <div className="flex flex-col gap-4 border-b border-zinc-800 bg-gradient-to-r from-emerald-950/70 to-zinc-950 p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
            <ScanLine className="size-4" /> Augmented impact view
          </div>
          <h2 className="mt-2 text-xl font-black text-white">See this forest grow</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">Point your camera at an open space to preview the planted {treeType.toLowerCase()} grove at different points in its growth.</p>
        </div>
        <button
          type="button"
          onClick={toggleCamera}
          disabled={cameraState === "starting"}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
        >
          {cameraState === "active" ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
          {cameraState === "active" ? "Close camera" : cameraState === "starting" ? "Starting camera..." : "Use camera"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_270px]">
        <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(circle_at_50%_38%,#365b4a_0%,#163b35_28%,#081b20_68%,#050b11_100%)]">
          {cameraState === "active" && <video ref={videoRef} muted playsInline className="absolute inset-0 size-full object-cover opacity-75" aria-label="Live camera view" />}
          <div className="absolute inset-0 bg-[linear-gradient(transparent_97%,rgba(110,231,183,0.15)_100%)] bg-[size:100%_34px]" />
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-emerald-300/30 bg-black/35 px-3 py-1.5 text-xs font-semibold text-emerald-200 backdrop-blur-sm">
            <span className={`size-2 rounded-full ${cameraState === "active" ? "animate-pulse bg-rose-400" : "bg-emerald-400"}`} />
            {cameraState === "active" ? "LIVE AR PREVIEW" : "IMPACT PREVIEW"}
          </div>
          <div className="absolute right-4 top-4 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-right text-xs text-zinc-300 backdrop-blur-sm">
            <p className="flex items-center justify-end gap-1 text-emerald-300"><MapPin className="size-3" /> {location}</p>
            <p className="mt-1 text-[11px] text-zinc-400">{timeline.label} · {timeline.description}</p>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-[linear-gradient(transparent,#071512)]" />
          <div className="absolute inset-x-8 bottom-10 h-32 rounded-[50%] bg-emerald-950/50 blur-2xl" />
          <div className="absolute inset-x-8 bottom-10 flex h-64 items-end justify-center gap-1 sm:gap-3">
            {Array.from({ length: visibleTrees }).map((_, index) => {
              const offset = (index - (visibleTrees - 1) / 2) * 5;
              const height = 72 + ((index * 17) % 55);
              return (
                <div key={index} className="relative shrink-0 transition-all duration-500" style={{ height: `${height * canopyScale}px`, transform: `translateX(${offset}px)` }}>
                  <div className="absolute bottom-0 left-1/2 h-20 w-2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-950 to-amber-700" />
                  <Trees className="absolute bottom-12 left-1/2 size-20 -translate-x-1/2 text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.45)] sm:size-24" strokeWidth={1.4} />
                  {index % 3 === 0 && <Leaf className="absolute bottom-24 left-1/2 size-5 -translate-x-1/2 text-lime-300" />}
                </div>
              );
            })}
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-emerald-200/30 bg-emerald-950/70 px-4 py-2 text-center backdrop-blur-sm">
            <p className="text-lg font-black text-white">{projectedTrees.toLocaleString()}</p>
            <p className="text-[10px] uppercase tracking-wider text-emerald-300">projected trees</p>
          </div>
          {cameraState === "denied" && <p className="absolute bottom-4 left-4 right-4 rounded-lg border border-amber-400/20 bg-amber-950/80 px-3 py-2 text-center text-xs text-amber-200">Camera access is unavailable. You are viewing the interactive forest preview instead.</p>}
        </div>

        <aside className="border-t border-zinc-800 bg-zinc-900/80 p-5 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Growth timeline</p><p className="mt-1 text-sm text-zinc-300">Drag through the impact</p></div>
            <Trees className="size-5 text-emerald-400" />
          </div>
          <div className="mt-6 space-y-2">
            {TIMELINE.map((item) => (
              <button key={item.year} type="button" onClick={() => setSelectedYear(item.year)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${selectedYear === item.year ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-600"}`}>
                <span><span className="block text-sm font-bold text-zinc-100">{item.label}</span><span className="mt-1 block text-xs text-zinc-500">{item.description}</span></span>
                {selectedYear === item.year && <Check className="size-4 text-emerald-400" />}
              </button>
            ))}
          </div>
          <div className="mt-6 space-y-3 border-t border-zinc-800 pt-5 text-xs">
            <div className="flex justify-between"><span className="text-zinc-500">Currently planted</span><strong className="text-zinc-200">{treesPlanted.toLocaleString()}</strong></div>
            <div className="flex justify-between"><span className="text-zinc-500">Projected canopy</span><strong className="text-emerald-400">{projectedTrees.toLocaleString()} trees</strong></div>
            <p className="pt-2 leading-relaxed text-zinc-500">Projection is a visual estimate for sponsor education, not a survey of exact tree height or canopy spread.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}