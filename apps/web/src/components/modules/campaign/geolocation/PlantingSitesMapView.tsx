"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { CampaignPlantingSite } from "@/services/campaign-geolocation.service";

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/">CARTO</a>';

const SITE_COLORS = ["#22c55e", "#b102cd", "#38bdf8", "#eab308", "#f472b6", "#a3e635"];

/** Marker radius scales with the square root of the planted tree count. */
function radiusForTrees(treeCount: number): number {
  if (treeCount <= 0) return 6;
  return Math.min(6 + Math.round(Math.sqrt(treeCount) * 0.9), 22);
}

function colorForSpeciesCount(species: string[]): string {
  const count = species.length;
  return SITE_COLORS[Math.max(0, count - 1) % SITE_COLORS.length];
}

function MapUpdater({ sites }: { sites: CampaignPlantingSite[] }) {
  const map = useMap();

  useEffect(() => {
    if (sites.length === 0) return;
    const lats = sites.map((s) => s.latitude);
    const lngs = sites.map((s) => s.longitude);
    const padding = 3;
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats) - padding, Math.min(...lngs) - padding],
      [Math.max(...lats) + padding, Math.max(...lngs) + padding],
    ];
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, sites]);

  return null;
}

function SitePopup({ site }: { site: CampaignPlantingSite }) {
  const formattedTrees = site.treeCount.toLocaleString();

  return (
    <div className="min-w-[200px] space-y-2">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: colorForSpeciesCount(site.species) }}
        />
        <span className="text-[13px] font-semibold text-zinc-50">{site.campaignName}</span>
      </div>

      <dl className="space-y-1 text-xs text-zinc-400">
        <div className="flex items-center justify-between gap-3">
          <dt>Trees</dt>
          <dd className="font-bold text-emerald-400 tabular-nums">{formattedTrees}</dd>
        </div>
        {site.species.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <dt>Species</dt>
            <dd className="text-right text-zinc-300">{site.species.join(", ")}</dd>
          </div>
        )}
        {site.region && (
          <div className="flex items-center justify-between gap-3">
            <dt>Region</dt>
            <dd className="text-zinc-300">{site.region}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt>Status</dt>
          <dd className="text-zinc-300">{site.status}</dd>
        </div>
      </dl>

      <a
        href={`/campaigns/${site.campaignId}`}
        className="block w-full rounded-md bg-fundable-purple px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-fundable-purple/80 transition-colors"
      >
        View campaign
      </a>
    </div>
  );
}

function SiteMarker({ site }: { site: CampaignPlantingSite }) {
  const pathOptions = useMemo(
    () => ({
      color: colorForSpeciesCount(site.species),
      fillColor: colorForSpeciesCount(site.species),
      fillOpacity: 0.55,
      weight: 2,
      opacity: 1,
    }),
    [site],
  );

  const ariaLabel = `${site.campaignName} — ${site.treeCount.toLocaleString()} trees planted`;

  return (
    <CircleMarker
      center={[site.latitude, site.longitude]}
      pathOptions={pathOptions}
      radius={radiusForTrees(site.treeCount)}
      aria-label={ariaLabel}
    >
      <Popup>
        <SitePopup site={site} />
      </Popup>
    </CircleMarker>
  );
}

export interface PlantingSitesMapViewProps {
  sites: CampaignPlantingSite[];
  className?: string;
  isLoading?: boolean;
}

export function PlantingSitesMapView({
  sites,
  className = "",
  isLoading,
}: PlantingSitesMapViewProps) {
  // SSR hydration guard: `true` once mounted on the client, `false` during SSR,
  // so Leaflet never attempts to render on the server.
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!isMounted) return null;

  return (
    <div
      className={`relative w-full h-full min-h-[320px] sm:min-h-[440px] rounded-2xl overflow-hidden border border-zinc-800 ${className}`}
      role="application"
      aria-label="Global campaign planting sites map"
    >
      {isLoading && (
        <div
          className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/60 rounded-2xl"
          role="status"
          aria-label="Updating planting sites"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-fundable-purple border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-400">Updating planting sites...</p>
          </div>
        </div>
      )}
      {!isLoading && sites.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-center px-6">
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 text-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M12 22V2" />
              </svg>
            </div>
            <p className="text-sm text-zinc-500">No planting sites to display yet</p>
            <p className="text-xs text-zinc-600">Campaigns with GPS coordinates will show up here.</p>
          </div>
        </div>
      )}
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="w-full h-full"
        scrollWheelZoom
        zoomControl
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <MapUpdater sites={sites} />
        {sites.map((site) => (
          <SiteMarker key={site.id} site={site} />
        ))}
      </MapContainer>
    </div>
  );
}