"use client";

import { Satellite, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapLayer } from "@/hooks/use-map-layer";

export interface MapLayerToggleProps {
  layer: MapLayer;
  onLayerChange: (layer: MapLayer) => void;
  disabled?: boolean;
  isSwitching?: boolean;
}

const layers: { id: MapLayer; label: string; icon: typeof Map }[] = [
  { id: "vector", label: "Street", icon: Map },
  { id: "satellite", label: "Satellite", icon: Satellite },
];

export function MapLayerToggle({
  layer,
  onLayerChange,
  disabled = false,
  isSwitching = false,
}: MapLayerToggleProps) {
  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900/80 p-1 backdrop-blur-sm"
      role="radiogroup"
      aria-label="Map layer"
    >
      {layers.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={layer === id}
          aria-label={`${label} view`}
          disabled={disabled || isSwitching}
          onClick={() => onLayerChange(id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fundable-purple-2 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900",
            "disabled:cursor-not-allowed disabled:opacity-50",
            layer === id
              ? "bg-fundable-purple-2 text-white shadow-sm"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
      {isSwitching && (
        <div
          className="ml-1 size-3.5 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent"
          role="status"
          aria-label="Switching layer"
        />
      )}
    </div>
  );
}
