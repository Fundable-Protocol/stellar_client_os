import React, { useEffect, useState } from "react";

export function distanceInKm(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const earthRadiusKm = 6371;
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(toLat - fromLat);
  const dLng = radians(toLng - fromLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m away`;
  return `${Math.round(distanceKm)} km away`;
}

interface TreeDistanceProps {
  treeLatitude: number;
  treeLongitude: number;
}

/** Shows an approximate distance only after the sponsor grants browser geolocation consent. */
export function TreeDistance({ treeLatitude, treeLongitude }: TreeDistanceProps) {
  const [distance, setDistance] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "denied" | "unavailable">("idle");

  useEffect(() => {
    if (!navigator.geolocation) {
      setState("unavailable");
      return;
    }
    setState("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDistance(distanceInKm(coords.latitude, coords.longitude, treeLatitude, treeLongitude));
        setState("idle");
      },
      () => setState("denied"),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
  }, [treeLatitude, treeLongitude]);

  if (state === "loading") return <span className="text-xs text-zinc-400">Calculating approximate distance…</span>;
  if (state === "denied" || state === "unavailable") return <span className="text-xs text-zinc-500">Distance unavailable</span>;
  if (distance === null) return null;
  return <span aria-label="Approximate distance from your location" className="text-xs text-zinc-300">Approximately {formatDistance(distance)}</span>;
}

export default TreeDistance;
