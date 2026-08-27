"use client";

/**
 * useTilt — CSS 3D card tilt effect hook (issue #530)
 *
 * Computes real-time rotateX/rotateY values from pointer position
 * relative to a DOM element, returning inline-style values ready to
 * apply as CSS transforms.
 *
 * Respects prefers-reduced-motion: when the user has requested reduced
 * motion all transforms are zeroed and no event listeners are attached.
 *
 * @example
 * ```tsx
 * const { ref, style, isHovered } = useTilt({ maxTilt: 15, scale: 1.04 });
 * <div ref={ref} style={style}>…</div>
 * ```
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export interface UseTiltOptions {
  /** Maximum tilt angle in degrees. Default: 12 */
  maxTilt?: number;
  /** Scale factor on hover. Default: 1.03 */
  scale?: number;
  /** Transition speed in ms. Default: 400 */
  transitionMs?: number;
  /** Whether to show a glare overlay. Default: true */
  glare?: boolean;
  /** Maximum glare opacity (0–1). Default: 0.25 */
  maxGlare?: number;
  /** Disable all tilt effects (e.g. on touch-only devices). Default: false */
  disabled?: boolean;
}

export interface TiltState {
  /** Attach this ref to the element you want to tilt. */
  ref: React.RefObject<HTMLDivElement>;
  /** Apply these styles to the tilt element. */
  style: CSSProperties;
  /** Glare overlay style (position absolute, pointer-events: none). */
  glareStyle: CSSProperties;
  /** Whether the pointer is currently over the element. */
  isHovered: boolean;
  /** Whether tilt is active (online + not reduced-motion + not disabled). */
  isActive: boolean;
  /** Reset tilt to neutral position. */
  reset: () => void;
}

export function useTilt(options: UseTiltOptions = {}): TiltState {
  const {
    maxTilt = 12,
    scale = 1.03,
    transitionMs = 400,
    glare = true,
    maxGlare = 0.25,
    disabled = false,
  } = options;

  const ref = useRef<HTMLDivElement>(null!);
  const [isHovered, setIsHovered] = useState(false);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glareAngle, setGlareAngle] = useState(0);
  const [glareOpacity, setGlareOpacity] = useState(0);
  // Detect prefers-reduced-motion (external store — no setState in effects)
  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );

  const isActive = !disabled && !prefersReduced;

  const reset = useCallback(() => {
    setRotateX(0);
    setRotateY(0);
    setGlareOpacity(0);
    setIsHovered(false);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const el = ref.current;
    if (!el) return;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      // Normalise pointer position to [-1, 1] within the element
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      setRotateY(x * maxTilt);
      setRotateX(-y * maxTilt);

      if (glare) {
        // Glare angle follows the pointer
        const angle = Math.atan2(y, x) * (180 / Math.PI);
        setGlareAngle(angle);
        // Opacity peaks at the edges
        const dist = Math.sqrt(x * x + y * y) / Math.SQRT2;
        setGlareOpacity(dist * maxGlare);
      }
    };

    const handlePointerEnter = () => setIsHovered(true);

    const handlePointerLeave = () => {
      setIsHovered(false);
      setRotateX(0);
      setRotateY(0);
      setGlareOpacity(0);
    };

    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerenter", handlePointerEnter);
    el.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerenter", handlePointerEnter);
      el.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [isActive, maxTilt, glare, maxGlare]);

  const transition = isHovered
    ? `transform 80ms ease-out`
    : `transform ${transitionMs}ms ease-out`;

  const style: CSSProperties = isActive
    ? {
        transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${isHovered ? scale : 1})`,
        transition,
        willChange: "transform",
        transformStyle: "preserve-3d",
      }
    : {};

  const glareStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    background: `linear-gradient(${glareAngle}deg, rgba(255,255,255,${glareOpacity}) 0%, transparent 80%)`,
    pointerEvents: "none",
    zIndex: 2,
    opacity: isHovered && isActive ? 1 : 0,
    transition: `opacity ${transitionMs}ms ease-out`,
  };

  return { ref, style, glareStyle, isHovered, isActive, reset };
}
