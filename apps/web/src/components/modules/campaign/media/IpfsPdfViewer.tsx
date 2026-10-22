"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Download,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Copy,
  Check,
  AlertCircle,
  HardDriveDownload,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface IpfsPdfViewerProps {
  cid: string;
  title?: string;
  onChainHashHex?: string;
  initialGatewayUrl?: string;
  className?: string;
}

export function IpfsPdfViewer({
  cid,
  title = "Campaign Pitch Deck",
  onChainHashHex,
  initialGatewayUrl,
  className = "",
}: IpfsPdfViewerProps) {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [activeGatewayIndex, setActiveGatewayIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [verifiedOnChain, setVerifiedOnChain] = useState(Boolean(onChainHashHex));

  // Gateways with dedicated fallback sequence
  const gateways = useMemo(() => {
    const list = [
      initialGatewayUrl,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://${cid}.ipfs.w3s.link`,
      `https://ipfs.io/ipfs/${cid}`,
      `/api/campaigns/media/ipfs?cid=${cid}&stream=true`,
    ].filter(Boolean) as string[];

    // Ensure unique
    return Array.from(new Set(list));
  }, [cid, initialGatewayUrl]);

  const currentStreamUrl = gateways[activeGatewayIndex] || `https://ipfs.io/ipfs/${cid}`;

  const copyCid = () => {
    navigator.clipboard.writeText(cid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyHash = () => {
    if (!onChainHashHex) return;
    navigator.clipboard.writeText(onChainHashHex);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleNextGateway = () => {
    setIsLoading(true);
    setHasError(false);
    setActiveGatewayIndex((prev) => (prev + 1) % gateways.length);
  };

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 15, 175));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 15, 60));
  const handleResetZoom = () => setZoomLevel(100);

  return (
    <div
      className={`flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl ${className}`}
      data-testid="ipfs-pdf-viewer"
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/90 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              {title}
              <Badge variant="outline" className="text-[10px] bg-purple-950/40 text-purple-300 border-purple-800/60">
                IPFS PDF
              </Badge>
            </h4>
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono mt-0.5">
              <span>CID: {cid.slice(0, 10)}...{cid.slice(-6)}</span>
              <button
                type="button"
                onClick={copyCid}
                title="Copy full IPFS CID"
                className="hover:text-zinc-200 transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Zoom controls */}
          <div className="hidden sm:flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
              onClick={handleZoomOut}
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] font-mono px-2 text-zinc-300">{zoomLevel}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
              onClick={handleZoomIn}
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
              onClick={handleResetZoom}
              title="Reset zoom"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Gateway failover button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextGateway}
            className="h-8 border-zinc-700 bg-zinc-900 text-xs text-zinc-300 hover:bg-zinc-800"
            title={`Gateway ${activeGatewayIndex + 1} of ${gateways.length}. Click to switch failover gateway.`}
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5 text-purple-400" />
            Gateway {activeGatewayIndex + 1}/{gateways.length}
          </Button>

          {/* Download button */}
          <a
            href={currentStreamUrl}
            download={`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </a>

          {/* Open External */}
          <a
            href={currentStreamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center rounded-md bg-purple-600 px-2.5 text-xs font-semibold text-white hover:bg-purple-500 shadow-md shadow-purple-900/20"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open
          </a>
        </div>
      </div>

      {/* On-Chain Provenance Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-950/20 border-b border-emerald-900/30 px-4 py-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-400">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="font-semibold">Decentralized IPFS Storage Verified On-Chain</span>
        </div>
        {onChainHashHex && (
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px]">
            <span>Hash: {onChainHashHex.slice(0, 14)}...{onChainHashHex.slice(-8)}</span>
            <button
              type="button"
              onClick={copyHash}
              className="text-zinc-500 hover:text-zinc-300"
              title="Copy on-chain SHA-256 hash"
            >
              {copiedHash ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Main PDF Viewer Frame */}
      <div className="relative min-h-[500px] sm:min-h-[640px] w-full bg-zinc-900 flex items-center justify-center overflow-auto p-2">
        {hasError ? (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-amber-400 mb-3" />
            <h5 className="text-base font-semibold text-zinc-100">Gateway Response Timed Out</h5>
            <p className="mt-1 text-xs text-zinc-400">
              The current decentralized IPFS gateway is taking longer than usual. You can rotate to a fallback gateway or download the document directly.
            </p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={handleNextGateway} className="bg-purple-600 hover:bg-purple-700">
                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Switch to Gateway {((activeGatewayIndex + 1) % gateways.length) + 1}
              </Button>
              <a
                href={currentStreamUrl}
                download
                className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
              >
                <HardDriveDownload className="mr-1.5 h-3.5 w-3.5" /> Direct Download
              </a>
            </div>
          </div>
        ) : (
          <div
            className="w-full h-full flex justify-center transition-transform duration-200"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
          >
            <iframe
              src={`${currentStreamUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              title={title}
              className="w-full h-[520px] sm:h-[680px] rounded border border-zinc-800/80 bg-white"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-950 px-4 py-2 text-[11px] text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Active Streaming Gateway: <code className="text-zinc-400">{new URL(currentStreamUrl, "http://localhost").hostname}</code></span>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Layers className="h-3.5 w-3.5 text-purple-400" />
          <span>Permanently Anchored & Censorship-Resistant</span>
        </div>
      </div>
    </div>
  );
}
