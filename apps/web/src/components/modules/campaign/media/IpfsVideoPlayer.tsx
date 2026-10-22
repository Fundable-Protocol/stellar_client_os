"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCw,
  ShieldCheck,
  Film,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface IpfsVideoPlayerProps {
  cid: string;
  title?: string;
  posterUrl?: string;
  onChainHashHex?: string;
  initialGatewayUrl?: string;
  className?: string;
  autoPlay?: boolean;
}

export function IpfsVideoPlayer({
  cid,
  title = "Campaign Demo Video",
  posterUrl,
  onChainHashHex,
  initialGatewayUrl,
  className = "",
  autoPlay = false,
}: IpfsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [copied, setCopied] = useState(false);
  const [activeGatewayIndex, setActiveGatewayIndex] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  // Ordered fallback gateways
  const gateways = useMemo(() => {
    const list = [
      initialGatewayUrl,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://${cid}.ipfs.w3s.link`,
      `https://ipfs.io/ipfs/${cid}`,
      `/api/campaigns/media/ipfs?cid=${cid}&stream=true`,
    ].filter(Boolean) as string[];

    return Array.from(new Set(list));
  }, [cid, initialGatewayUrl]);

  const currentStreamUrl = gateways[activeGatewayIndex] || `https://ipfs.io/ipfs/${cid}`;

  // Time formatting helper
  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch((err) => {
        console.warn("Video play error, attempting next gateway:", err);
        handleFailover();
      });
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    setIsBuffering(false);
    setHasFailed(false);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const targetTime = Number(e.target.value);
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const val = Number(e.target.value);
    videoRef.current.volume = val;
    setVolume(val);
    setIsMuted(val === 0);
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  };

  const cyclePlaybackRate = () => {
    if (!videoRef.current) return;
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIndex];
    videoRef.current.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const handleFailover = () => {
    const nextIndex = (activeGatewayIndex + 1) % gateways.length;
    setActiveGatewayIndex(nextIndex);
    setIsBuffering(true);
    if (nextIndex === 0) {
      setHasFailed(true);
    }
  };

  const copyCid = () => {
    navigator.clipboard.writeText(cid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`group relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl ${className}`}
      data-testid="ipfs-video-player"
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-900/90 px-4 py-2.5 z-10">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold text-zinc-100 truncate">{title}</span>
          <Badge variant="outline" className="text-[10px] bg-purple-950/40 text-purple-300 border-purple-800/60">
            IPFS STREAM
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
            <span>CID: {cid.slice(0, 8)}...{cid.slice(-6)}</span>
            <button
              type="button"
              onClick={copyCid}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Copy IPFS CID"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleFailover}
            className="h-7 border-zinc-700 bg-zinc-900 text-[11px] text-zinc-300 hover:bg-zinc-800"
            title="Switch decentralized streaming gateway"
          >
            <RotateCw className="mr-1 h-3 w-3 text-purple-400" />
            Gateway {activeGatewayIndex + 1}/{gateways.length}
          </Button>

          <a
            href={currentStreamUrl}
            download={`${title.toLowerCase().replace(/\s+/g, "-")}.mp4`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 items-center rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800"
            title="Download video from IPFS"
          >
            <Download className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Main Video Screen */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          src={currentStreamUrl}
          poster={posterUrl}
          autoPlay={autoPlay}
          playsInline
          className="h-full w-full object-contain cursor-pointer"
          onClick={togglePlay}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => setIsBuffering(false)}
          onError={handleFailover}
        />

        {/* Big center play button when paused */}
        {!isPlaying && !isBuffering && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label="Play video"
            className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-purple-600/90 text-white shadow-xl shadow-purple-900/40 transition-transform hover:scale-110 active:scale-95"
          >
            <Play className="h-8 w-8 ml-1 fill-white" />
          </button>
        )}

        {/* Buffering spinner */}
        {isBuffering && (
          <div className="absolute flex flex-col items-center justify-center gap-2 rounded-lg bg-black/60 px-4 py-3 backdrop-blur-sm">
            <RotateCw className="h-7 w-7 text-purple-400 animate-spin" />
            <span className="text-xs text-zinc-300 font-medium">Streaming from IPFS...</span>
          </div>
        )}

        {/* Error / Failover state */}
        {hasFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-400 mb-2" />
            <p className="text-sm font-semibold text-zinc-100">Video Gateway Reconnecting</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm">
              Connecting across distributed IPFS nodes. Click below to retry alternate CDN or download directly.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={handleFailover} className="bg-purple-600 hover:bg-purple-700 text-xs">
                Retry Gateways
              </Button>
              <a
                href={currentStreamUrl}
                download
                className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-200"
              >
                Direct Download
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Custom Video Controls Bar */}
      <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        {/* Progress Scrubber */}
        <div className="relative flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            aria-label="Video seek bar"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-purple-500 focus:outline-none"
          />
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between text-zinc-300">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-200 hover:text-white hover:bg-zinc-800"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
            </Button>

            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-800"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute audio" : "Mute audio"}
              >
                {isMuted || volume === 0 ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume control"
                className="h-1 w-16 sm:w-20 cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-purple-500"
              />
            </div>

            <span className="text-xs font-mono text-zinc-400 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Playback speed */}
            <Button
              variant="ghost"
              size="sm"
              onClick={cyclePlaybackRate}
              className="h-7 px-2 text-xs font-mono text-zinc-400 hover:text-zinc-100"
            >
              {playbackRate}x
            </Button>

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-300 hover:text-white hover:bg-zinc-800"
              onClick={toggleFullscreen}
              aria-label="Toggle fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* On-Chain & IPFS Provenance Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-850 bg-zinc-900/60 px-4 py-1.5 text-[11px] text-zinc-400">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-medium">Stored on Decentralized IPFS with Fallback CDN</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-zinc-500">
            <Radio className="h-3 w-3 text-purple-400 animate-pulse" />
            CDN Edge Active
          </span>
          {onChainHashHex && (
            <span className="font-mono text-zinc-400">Hash: {onChainHashHex.slice(0, 10)}...</span>
          )}
        </div>
      </div>
    </div>
  );
}
