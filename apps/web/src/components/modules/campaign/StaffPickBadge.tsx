import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface StaffPickBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  reason?: string;
}

/**
 * Special badge identifying an editorial-curated Staff Pick campaign.
 */
export function StaffPickBadge({
  className,
  size = "sm",
  reason,
}: StaffPickBadgeProps) {
  const sizeClasses = {
    sm: "px-2.5 py-0.5 text-[10px]",
    md: "px-3 py-1 text-xs",
    lg: "px-3.5 py-1.5 text-sm",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <span
      data-testid="staff-pick-badge"
      title={reason ? `Staff Pick: ${reason}` : "Staff Pick: Curated by platform editorial team"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wider",
        "bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/10",
        "text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/10",
        sizeClasses[size],
        className
      )}
    >
      <Sparkles className={cn("text-amber-400 fill-amber-400/30", iconSizes[size])} aria-hidden="true" />
      <span>Staff Pick</span>
    </span>
  );
}
