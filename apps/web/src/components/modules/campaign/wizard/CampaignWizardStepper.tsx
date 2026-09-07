"use client";

import React from "react";
import { Check, Circle } from "lucide-react";
import { CampaignWizardStepDef } from "./campaign-wizard-config";
import { cn } from "@/lib/utils";

export interface CampaignWizardStepperProps {
  steps: readonly CampaignWizardStepDef[];
  currentIndex: number;
  onStepSelect: (index: number) => void;
  disabled?: boolean;
}

export function CampaignWizardStepper({
  steps,
  currentIndex,
  onStepSelect,
  disabled = false,
}: CampaignWizardStepperProps) {
  return (
    <nav aria-label="Campaign creation steps" className="w-full py-2">
      <ol className="grid grid-cols-5 gap-2 sm:gap-4">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <li key={step.id} className="relative flex flex-col items-center">
              <button
                type="button"
                onClick={() => onStepSelect(idx)}
                disabled={disabled || (!isCompleted && !isCurrent && idx > currentIndex + 1)}
                className={cn(
                  "group flex w-full flex-col items-center border-t-2 pt-3 transition-colors focus:outline-none",
                  isCompleted
                    ? "border-emerald-500 text-emerald-400"
                    : isCurrent
                    ? "border-purple-500 text-purple-300"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-400"
                )}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs transition-transform group-hover:scale-105",
                      isCompleted
                        ? "bg-emerald-500/20 text-emerald-400"
                        : isCurrent
                        ? "bg-purple-600 text-white shadow-lg shadow-purple-500/30"
                        : "bg-zinc-800 text-zinc-500"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    ) : (
                      <span>{idx + 1}</span>
                    )}
                  </span>
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
                <span className="mt-1 text-[10px] text-zinc-400 sm:hidden">
                  {step.title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
