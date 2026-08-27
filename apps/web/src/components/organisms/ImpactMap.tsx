"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";
import { MapLayerToggle } from "@/components/molecules/MapLayerToggle";
import { useMapLayer, type MapLayer } from "@/hooks/use-map-layer";
import { Skeleton } from "@/components/ui/skeleton";

const TILE_SOURCES: Record<MapLayer, { tiles: string[]; attribution: string }> =
  {
    vector: {
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      attribution: "&copy; OpenStreetMap contributors",
    },
    satellite: {
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      attribution:
        "&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    },
  };

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1.5;

interface ErrorState {
  message: string;
  retry: () => void;
}

export interface ImpactMapProps {
  className?: string;
}

export function ImpactMap({ className }: ImpactMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tileError, setTileError] = useState<ErrorState | null>(null);

  const { layer, setLayer, isSwitching, error, clearError } = useMapLayer();

  const updateLayer = useCallback(
    (map: maplibregl.Map, newLayer: MapLayer) => {
      const sourceId = "basemap";
      const layerId = "basemap-layer";

      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      const source = TILE_SOURCES[newLayer];

      map.addSource(sourceId, {
        type: "raster",
        tiles: source.tiles,
        tileSize: 256,
        attribution: source.attribution,
      });

      map.addLayer({ id: layerId, type: "raster", source: sourceId });

      setTileError(null);
    },
    []
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      zoom: DEFAULT_ZOOM,
      center: DEFAULT_CENTER,
      attributionControl: { compact: true },
    });

    map.on("load", () => {
      updateLayer(map, layer);
      setMapLoaded(true);
    });

    map.on("error", (e) => {
      if (
        e.error &&
        typeof e.error === "object" &&
        "status" in e.error &&
        (e.error as { status: number }).status === 404
      ) {
        setTileError({
          message: "Failed to load map tiles. Please try again.",
          retry: () => {
            setTileError(null);
            if (mapRef.current) {
              updateLayer(mapRef.current, layer);
            }
          },
        });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [updateLayer, layer]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    updateLayer(mapRef.current, layer);
  }, [layer, mapLoaded, updateLayer]);

  return (
    <section
      className={cn("relative flex flex-col overflow-hidden rounded-xl", className)}
      aria-label="Impact projects map"
    >
      <div className="relative flex-1 min-h-[300px] md:min-h-[400px] lg:min-h-[500px]">
        {!mapLoaded && (
          <Skeleton className="absolute inset-0 z-10 rounded-xl bg-zinc-900" />
        )}

        <div
          ref={mapContainerRef}
          className={cn(
            "absolute inset-0 rounded-xl",
            !mapLoaded && "invisible"
          )}
        />

        {isSwitching && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 rounded-xl"
            role="status"
            aria-label="Switching map layer"
          >
            <div className="size-8 animate-spin rounded-full border-4 border-fundable-purple-2 border-t-transparent" />
          </div>
        )}

        {tileError && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-zinc-900/90 rounded-xl p-6"
            role="alert"
          >
            <p className="text-sm text-zinc-400 text-center">{tileError.message}</p>
            <button
              type="button"
              onClick={tileError.retry}
              className="rounded-md bg-fundable-purple-2 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-fundable-purple-2/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fundable-purple-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            >
              Retry
            </button>
          </div>
        )}

        {error && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-lg bg-red-900/80 px-4 py-2 text-xs text-red-200 backdrop-blur-sm"
            role="alert"
          >
            <span>{error.message}</span>
            <button
              type="button"
              onClick={clearError}
              className="ml-1 text-red-300 underline hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 z-20">
        <MapLayerToggle
          layer={layer}
          onLayerChange={setLayer}
          disabled={!mapLoaded}
          isSwitching={isSwitching}
        />
      </div>

      {!mapLoaded && (
        <div className="flex items-center justify-center gap-2 p-4 text-xs text-zinc-500">
          <div className="size-3 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
          Loading map...
        </div>
      )}
    </section>
  );
}
