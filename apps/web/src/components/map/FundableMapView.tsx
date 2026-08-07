"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { FundableMapProps, StreamCluster, FundableStream } from "./types";
import {
  clusterStreams,
  getClusterColor,
  getClusterRadius,
  getStatusColor,
} from "./cluster-utils";

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/">CARTO</a>';

const popupStyles = {
  container: {
    background: "#0d0019",
    border: "1px solid #27272a",
    borderRadius: "8px",
    padding: "6px",
    minWidth: "200px",
    maxHeight: "260px",
    overflowY: "auto",
  } as React.CSSProperties,
  item: {
    display: "block",
    width: "100%",
    padding: "8px 10px",
    marginBottom: "4px",
    background: "transparent",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    textAlign: "left",
    color: "#c9ccd2",
    transition: "background 0.15s ease",
  } as React.CSSProperties,
  itemHover: {
    background: "rgba(177, 2, 205, 0.1)",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "4px",
  } as React.CSSProperties,
  title: {
    color: "#fff",
    fontSize: "13px",
    fontWeight: 600,
    lineHeight: 1.3,
  } as React.CSSProperties,
  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  } as React.CSSProperties,
  details: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "12px",
    paddingLeft: "16px",
    color: "#a1a1aa",
  } as React.CSSProperties,
  category: {
    color: "#71717a",
    fontSize: "11px",
  } as React.CSSProperties,
};

function MapUpdater({ streams }: { streams: FundableStream[] }) {
  const map = useMap();

  useEffect(() => {
    if (streams.length === 0) return;
    const lats = streams.map((s) => s.location.lat);
    const lngs = streams.map((s) => s.location.lng);
    const padding = 3;
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats) - padding, Math.min(...lngs) - padding],
      [Math.max(...lats) + padding, Math.max(...lngs) + padding],
    ];
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, streams]);

  return null;
}

function PopupItem({
  stream,
  onStreamSelect,
}: {
  stream: FundableStream;
  onStreamSelect?: (stream: FundableStream) => void;
}) {
  const [itemHovered, setItemHovered] = useState(false);

  const handleClick = useCallback(() => {
    onStreamSelect?.(stream);
  }, [onStreamSelect, stream]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onStreamSelect?.(stream);
      }
    },
    [onStreamSelect, stream],
  );

  return (
    <button
      type="button"
      style={{
        ...popupStyles.item,
        ...(itemHovered ? popupStyles.itemHover : {}),
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setItemHovered(true)}
      onMouseLeave={() => setItemHovered(false)}
      onFocus={() => setItemHovered(true)}
      onBlur={() => setItemHovered(false)}
      aria-label={`${stream.title} - ${stream.amount} ${stream.currency} - ${stream.status}`}
    >
      <div style={popupStyles.header}>
        <span
          style={{
            ...popupStyles.statusDot,
            backgroundColor: getStatusColor(stream.status),
          }}
        />
        <span style={popupStyles.title}>{stream.title}</span>
      </div>
      <div style={popupStyles.details}>
        <span>
          {stream.amount} {stream.currency}
        </span>
        <span style={popupStyles.category}>{stream.category}</span>
      </div>
    </button>
  );
}

function MapClusterMarker({
  cluster,
  onStreamSelect,
}: {
  cluster: StreamCluster;
  onStreamSelect?: (stream: FundableStream) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const color = getClusterColor(cluster.count);
  const radius = getClusterRadius(cluster.count);

  const eventHandlers = useMemo(
    () => ({
      mouseover() {
        setIsHovered(true);
      },
      mouseout() {
        setIsHovered(false);
      },
    }),
    [],
  );

  return (
    <CircleMarker
      center={[cluster.latitude, cluster.longitude]}
      pathOptions={{
        color: isHovered ? "#fff" : color,
        fillColor: color,
        fillOpacity: isHovered ? 0.85 : 0.55,
        weight: isHovered ? 3 : 2,
        opacity: 1,
      }}
      radius={isHovered ? radius + 3 : radius}
      eventHandlers={eventHandlers}
      aria-label={`Cluster of ${cluster.count} fundable stream${cluster.count !== 1 ? "s" : ""}`}
      role="button"
      tabIndex={0}
    >
      <Popup>
        <div style={popupStyles.container}>
          {cluster.streams.map((stream) => (
            <PopupItem
              key={stream.id}
              stream={stream}
              onStreamSelect={onStreamSelect}
            />
          ))}
        </div>
      </Popup>
    </CircleMarker>
  );
}

export function FundableMapView({
  streams,
  className = "",
  onStreamSelect,
  isLoading,
}: FundableMapProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const clusters = useMemo(() => clusterStreams(streams), [streams]);

  if (!isMounted) return null;

  return (
    <div
      className={`relative w-full h-full min-h-[300px] sm:min-h-[400px] rounded-2xl overflow-hidden border border-zinc-800 ${className}`}
      role="application"
      aria-label="Fundable streams world map"
    >
      {isLoading && (
        <div
          className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/60 rounded-2xl"
          role="status"
          aria-label="Updating map data"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-fundable-purple border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-400">Updating streams...</p>
          </div>
        </div>
      )}
      {!isLoading && streams.length === 0 && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 text-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <p className="text-sm text-zinc-500">No fundable streams to display</p>
          </div>
        </div>
      )}
      <MapContainer
        center={[20, 0]}
        zoom={2}
        className="w-full h-full"
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <MapUpdater streams={streams} />
        {clusters.map((cluster) => (
          <MapClusterMarker
            key={cluster.id}
            cluster={cluster}
            onStreamSelect={onStreamSelect}
          />
        ))}
      </MapContainer>
    </div>
  );
}
