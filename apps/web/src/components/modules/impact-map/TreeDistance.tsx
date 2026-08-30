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
  const [state, setState] = useState<"idle" | "loading" | "denied">("loading");
  const [prevCoords, setPrevCoords] = useState<{ lat: number; lng: number } | null>(null);

  const geolocationUnavailable = typeof navigator !== "undefined" && !navigator.geolocation;

  // Reset to "loading" whenever the tree's coordinates change.  Adjusting state
  // during render (instead of inside the effect) avoids a cascading render and
  // keeps the effect focused on the external geolocation API.
  if (prevCoords === null || prevCoords.lat !== treeLatitude || prevCoords.lng !== treeLongitude) {
    setPrevCoords({ lat: treeLatitude, lng: treeLongitude });
    setState("loading");
    setDistance(null);
  }

  useEffect(() => {
    if (geolocationUnavailable) {
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;
        setDistance(distanceInKm(coords.latitude, coords.longitude, treeLatitude, treeLongitude));
        setState("idle");
      },
      () => {
        if (!cancelled) setState("denied");
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 8_000 },
    );
    return () => {
      cancelled = true;
    };
  }, [treeLatitude, treeLongitude, geolocationUnavailable]);

  if (geolocationUnavailable || state === "denied") {
    return <span className="text-xs text-zinc-500">Distance unavailable</span>;
  }
  if (state === "loading") return <span className="text-xs text-zinc-400">Calculating approximate distance…</span>;
  if (distance === null) return null;
  return <span aria-label="Approximate distance from your location" className="text-xs text-zinc-300">Approximately {formatDistance(distance)}</span>;
}

export default TreeDistance;
