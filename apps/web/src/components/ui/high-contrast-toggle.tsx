"use client";

import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useHighContrast } from "@/providers/HighContrastProvider";

export interface HighContrastToggleProps {
  className?: string;
  showLabel?: boolean;
}

export function HighContrastToggle({
  className = "",
  showLabel = true,
}: HighContrastToggleProps) {
  const { isHighContrast, toggleHighContrast } = useHighContrast();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleHighContrast();
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isHighContrast}
      aria-label={`Toggle high-contrast color mode. Currently ${isHighContrast ? "enabled" : "disabled"}.`}
      onClick={toggleHighContrast}
      onKeyDown={handleKeyDown}
      data-testid="high-contrast-toggle"
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2
        ${
          isHighContrast
            ? "border-yellow-400 bg-black text-yellow-300 ring-2 ring-yellow-400 hover:bg-zinc-900"
            : "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:border-zinc-500"
        } ${className}`}
    >
      {isHighContrast ? (
        <Eye className="h-4 w-4 text-yellow-300 shrink-0" aria-hidden="true" />
      ) : (
        <EyeOff className="h-4 w-4 text-zinc-300 shrink-0" aria-hidden="true" />
      )}
      {showLabel && (
        <span className="tracking-wide">
          Contrast:{" "}
          <span className={isHighContrast ? "font-bold text-yellow-300" : "font-normal text-zinc-300"}>
            {isHighContrast ? "On (4.5:1+)" : "Off"}
          </span>
        </span>
      )}
    </button>
  );
}

export default HighContrastToggle;
