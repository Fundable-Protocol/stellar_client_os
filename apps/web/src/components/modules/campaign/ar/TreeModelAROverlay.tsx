"use client";

import React, { useId } from "react";
import type { TreeGrowthStageMetrics } from "@/lib/tree-growth";
import { getTreeProfile } from "@/lib/tree-growth";

export interface TreeModelAROverlayProps {
  metrics: TreeGrowthStageMetrics;
  treeType?: string;
  position: { x: number; y: number };
  scaleMultiplier: number;
  showReticle?: boolean;
  onPositionChange?: (pos: { x: number; y: number }) => void;
  className?: string;
}

export const TreeModelAROverlay: React.FC<TreeModelAROverlayProps> = ({
  metrics,
  treeType,
  position,
  scaleMultiplier,
  showReticle = true,
  onPositionChange,
  className = "",
}) => {
  const profile = getTreeProfile(treeType);
  const filterId = useId();

  // Handle tap-to-reposition within container
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPositionChange) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // Keep within reasonable bounds
    onPositionChange({
      x: Math.max(15, Math.min(85, x)),
      y: Math.max(35, Math.min(85, y)),
    });
  };

  // Base dimensions adjusted by growth scale and user slider
  const effectiveScale = metrics.visualScale * scaleMultiplier;
  const treeWidth = Math.round(260 * effectiveScale);
  const treeHeight = Math.round(380 * effectiveScale);

  // Canopy shape-specific variations
  const renderCanopyClusters = () => {
    const layers = metrics.branchLayers;
    const { canopyShape } = profile;

    if (canopyShape === "conical") {
      // Pine / Cedar / Redwood triangular tiers
      const tiers = [
        { cy: 80, rx: 45, ry: 35, opacity: 0.95 },
        { cy: 130, rx: 75, ry: 45, opacity: 0.92 },
        { cy: 185, rx: 105, ry: 55, opacity: 0.9 },
        { cy: 240, rx: 130, ry: 60, opacity: 0.88 },
      ].slice(0, layers);

      return (
        <g className="tree-canopy-group animate-sway">
          {tiers.map((tier, idx) => (
            <g key={idx}>
              <ellipse
                cx="150"
                cy={tier.cy}
                rx={tier.rx * metrics.foliageDensity}
                ry={tier.ry * metrics.foliageDensity}
                fill={metrics.foliageColor}
                opacity={tier.opacity}
              />
              <ellipse
                cx="145"
                cy={tier.cy - 8}
                rx={tier.rx * 0.75 * metrics.foliageDensity}
                ry={tier.ry * 0.7 * metrics.foliageDensity}
                fill={metrics.foliageHighlightColor}
                opacity={0.75}
              />
            </g>
          ))}
        </g>
      );
    }

    if (canopyShape === "umbrella") {
      // Acacia umbrella flat-topped crown
      return (
        <g className="tree-canopy-group animate-sway">
          <ellipse
            cx="150"
            cy="110"
            rx={140 * metrics.foliageDensity}
            ry={45 * metrics.foliageDensity}
            fill={metrics.foliageColor}
            opacity={0.92}
          />
          <ellipse
            cx="135"
            cy="95"
            rx={110 * metrics.foliageDensity}
            ry={32 * metrics.foliageDensity}
            fill={metrics.foliageHighlightColor}
            opacity={0.8}
          />
          <ellipse
            cx="165"
            cy="120"
            rx={95 * metrics.foliageDensity}
            ry={28 * metrics.foliageDensity}
            fill={metrics.foliageColor}
            opacity={0.7}
          />
        </g>
      );
    }

    // Default Rounded / Spreading / Climax crown (Oak, Fruit tree, Baobab, etc.)
    const clusters = [
      { cx: 150, cy: 90, r: 55 },
      { cx: 110, cy: 125, r: 48 },
      { cx: 190, cy: 125, r: 48 },
      { cx: 80, cy: 165, r: 42 },
      { cx: 220, cy: 165, r: 42 },
      { cx: 145, cy: 150, r: 58 },
      { cx: 120, cy: 190, r: 40 },
      { cx: 180, cy: 190, r: 40 },
    ].slice(0, Math.min(clustersCount(layers), 8));

    return (
      <g className="tree-canopy-group animate-sway">
        {clusters.map((c, i) => (
          <g key={i}>
            <circle
              cx={c.cx}
              cy={c.cy}
              r={c.r * metrics.foliageDensity}
              fill={metrics.foliageColor}
              opacity={0.9}
            />
            <circle
              cx={c.cx - 6}
              cy={c.cy - 8}
              r={c.r * 0.72 * metrics.foliageDensity}
              fill={metrics.foliageHighlightColor}
              opacity={0.65}
            />
          </g>
        ))}
      </g>
    );
  };

  return (
    <div
      className={`relative w-full h-full select-none touch-none ${className}`}
      onClick={handleContainerClick}
      data-testid="ar-tree-overlay-container"
    >
      {/* Ground Placement Shadow and Interactive Reticle */}
      <div
        className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300 ease-out"
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
        }}
        data-testid="ar-ground-reticle"
      >
        {/* Soft Ground Contact Shadow */}
        <div
          className="rounded-full bg-black/50 blur-md mx-auto"
          style={{
            width: `${Math.round(treeWidth * 0.9)}px`,
            height: `${Math.round(36 * effectiveScale)}px`,
          }}
        />

        {/* Reticle Rings */}
        {showReticle && (
          <div
            className="absolute inset-0 flex items-center justify-center -translate-y-2 opacity-80"
            style={{
              width: `${Math.round(treeWidth * 1.1)}px`,
              height: `${Math.round(48 * effectiveScale)}px`,
              marginLeft: `-${Math.round((treeWidth * 0.1) / 2)}px`,
            }}
          >
            <div className="w-full h-full rounded-full border-2 border-dashed border-emerald-400/80 animate-spin-slow flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />
            </div>
          </div>
        )}
      </div>

      {/* Main Botanical Tree Model */}
      <div
        className="absolute transform -translate-x-1/2 -translate-y-full pointer-events-none transition-all duration-500 ease-out"
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          width: `${treeWidth}px`,
          height: `${treeHeight}px`,
        }}
        data-testid="ar-virtual-tree-model"
      >
        {/* Floating AR Stage Tag above tree */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap z-20">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-950/85 border border-emerald-500/50 text-emerald-300 text-xs font-semibold shadow-xl backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{metrics.stageName}</span>
            <span className="text-zinc-400 font-mono text-[11px]">({metrics.heightMeters}m)</span>
          </div>
        </div>

        {/* Vector SVG Tree Render */}
        <svg
          viewBox="0 0 300 400"
          className="w-full h-full filter drop-shadow-2xl overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`trunkGrad-${filterId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2c1810" />
              <stop offset="45%" stopColor={metrics.barkColor} />
              <stop offset="100%" stopColor="#1a0f0a" />
            </linearGradient>
            <radialGradient id={`canopyGrad-${filterId}`} cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor={metrics.foliageHighlightColor} />
              <stop offset="70%" stopColor={metrics.foliageColor} />
              <stop offset="100%" stopColor="#052e16" />
            </radialGradient>
          </defs>

          {/* Root Buttresses / Flares grounded at y=380 */}
          <path
            d={`M 150 250 
               C 140 290, 115 350, 95 380 
               C 120 375, 140 370, 150 370 
               C 160 370, 180 375, 205 380 
               C 185 350, 160 290, 150 250 Z`}
            fill={`url(#trunkGrad-${filterId})`}
          />

          {/* Main Trunk Column */}
          <path
            d={`M ${150 - Math.min(18, metrics.trunkCaliperCm * 0.4)} 260
               Q 148 180 150 120
               Q 152 180 ${150 + Math.min(18, metrics.trunkCaliperCm * 0.4)} 260 Z`}
            fill={`url(#trunkGrad-${filterId})`}
          />

          {/* Structural Branches */}
          {metrics.branchLayers >= 2 && (
            <g stroke={`url(#trunkGrad-${filterId})`} strokeLinecap="round">
              <path
                d="M 148 200 Q 110 170 85 150"
                strokeWidth={Math.max(4, metrics.trunkCaliperCm * 0.22)}
                fill="none"
              />
              <path
                d="M 152 190 Q 190 160 215 145"
                strokeWidth={Math.max(4, metrics.trunkCaliperCm * 0.22)}
                fill="none"
              />
              {metrics.branchLayers >= 3 && (
                <>
                  <path
                    d="M 149 150 Q 120 120 100 100"
                    strokeWidth={Math.max(3, metrics.trunkCaliperCm * 0.15)}
                    fill="none"
                  />
                  <path
                    d="M 151 145 Q 180 115 200 95"
                    strokeWidth={Math.max(3, metrics.trunkCaliperCm * 0.15)}
                    fill="none"
                  />
                </>
              )}
            </g>
          )}

          {/* Foliage Canopy Clusters */}
          {renderCanopyClusters()}
        </svg>
      </div>

      <style>{`
        @keyframes sway {
          0%,
          100% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(1.2deg) skewX(0.5deg);
          }
        }
        .animate-sway {
          transform-origin: 150px 380px;
          animation: sway 6s ease-in-out infinite;
        }
        @keyframes spinSlow {
          from {
            transform: rotateX(70deg) rotateZ(0deg);
          }
          to {
            transform: rotateX(70deg) rotateZ(360deg);
          }
        }
        .animate-spin-slow {
          animation: spinSlow 12s linear infinite;
        }
      `}</style>
    </div>
  );
};

function clustersCount(layers: number): number {
  switch (layers) {
    case 1:
    case 2:
      return 3;
    case 3:
      return 5;
    case 4:
      return 7;
    default:
      return 8;
  }
}
