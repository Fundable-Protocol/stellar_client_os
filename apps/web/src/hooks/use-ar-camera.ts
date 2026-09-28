"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraStatus = "idle" | "requesting" | "active" | "denied" | "unsupported";
export type FacingMode = "environment" | "user";

export interface UseARCameraOptions {
  autoStart?: boolean;
  preferredFacingMode?: FacingMode;
}

export function useARCamera(options: UseARCameraOptions = {}) {
  const { autoStart = true, preferredFacingMode = "environment" } = options;

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>(preferredFacingMode);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  }, []);

  const startCamera = useCallback(
    async (targetFacingMode: FacingMode = facingMode) => {
      if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        setErrorMessage("Camera access is not supported by your current browser or platform.");
        return;
      }

      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      setStatus("requesting");
      setErrorMessage(null);

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: targetFacingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.muted = true;
          try {
            const playPromise = videoRef.current.play();
            if (playPromise && typeof playPromise.catch === "function") {
              await playPromise.catch(() => {});
            }
          } catch {
            // ignore media element play errors in test or restricted autoplay environments
          }
        }

        setStatus("active");
        setFacingMode(targetFacingMode);

        // Check if multiple video input devices are available
        if (navigator.mediaDevices.enumerateDevices) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = devices.filter((d) => d.kind === "videoinput");
            setHasMultipleCameras(videoInputs.length > 1);
          } catch {
            // device enumeration is optional
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.warn("AR camera start failed:", error.name, error.message);
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          setStatus("denied");
          setErrorMessage("Camera permission was denied. You can switch to AR Simulator mode.");
        } else {
          setStatus("unsupported");
          setErrorMessage(
            error.message || "Unable to access camera feed. Running in AR Simulator mode."
          );
        }
      }
    },
    [facingMode]
  );

  const flipCamera = useCallback(async () => {
    const nextMode: FacingMode = facingMode === "environment" ? "user" : "environment";
    await startCamera(nextMode);
  }, [facingMode, startCamera]);

  const captureSnapshot = useCallback(
    (overlayCanvas?: HTMLCanvasElement | null): string | null => {
      const video = videoRef.current;
      const width = video?.videoWidth || 1280;
      const height = video?.videoHeight || 720;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      // Draw camera background frame if active
      if (video && status === "active") {
        ctx.drawImage(video, 0, 0, width, height);
      } else {
        // Draw nature studio gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, "#1e3a8a");
        grad.addColorStop(0.5, "#065f46");
        grad.addColorStop(1, "#022c22");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // Draw AR overlay layer if provided
      if (overlayCanvas) {
        ctx.drawImage(overlayCanvas, 0, 0, width, height);
      }

      return canvas.toDataURL("image/png");
    },
    [status]
  );

  useEffect(() => {
    let cancelled = false;
    if (autoStart) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          void startCamera();
        }
      });
    }
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [autoStart, startCamera, stopCamera]);

  return {
    videoRef,
    status,
    errorMessage,
    facingMode,
    hasMultipleCameras,
    startCamera,
    stopCamera,
    flipCamera,
    captureSnapshot,
    isActive: status === "active",
    isFallback: status === "denied" || status === "unsupported",
  };
}
