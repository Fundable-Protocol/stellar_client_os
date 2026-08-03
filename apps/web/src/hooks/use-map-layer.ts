"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export type MapLayer = "vector" | "satellite";

const STORAGE_KEY = "fundable-map-layer";

function getInitialLayer(): MapLayer {
  if (typeof window === "undefined") return "vector";
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === "vector" || stored === "satellite") return stored;
  } catch {}
  return "vector";
}

export interface UseMapLayerReturn {
  layer: MapLayer;
  setLayer: (layer: MapLayer) => void;
  toggleLayer: () => void;
  isSwitching: boolean;
  error: Error | null;
  clearError: () => void;
}

export function useMapLayer(): UseMapLayerReturn {
  const [layer, setLayerState] = useState<MapLayer>(getInitialLayer);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const switchingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, layer);
    } catch {}
  }, [layer]);

  const setLayer = useCallback((newLayer: MapLayer) => {
    setError(null);
    setIsSwitching(true);
    setLayerState(newLayer);

    if (switchingTimeoutRef.current) {
      clearTimeout(switchingTimeoutRef.current);
    }

    switchingTimeoutRef.current = setTimeout(() => {
      setIsSwitching(false);
    }, 500);
  }, []);

  const toggleLayer = useCallback(() => {
    setLayer(layer === "vector" ? "satellite" : "vector");
  }, [layer, setLayer]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (switchingTimeoutRef.current) {
        clearTimeout(switchingTimeoutRef.current);
      }
    };
  }, []);

  return {
    layer,
    setLayer,
    toggleLayer,
    isSwitching,
    error,
    clearError,
  };
}
