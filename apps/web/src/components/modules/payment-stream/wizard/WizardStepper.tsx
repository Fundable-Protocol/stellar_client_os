"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WizardStepDefinition } from "./wizard-config";

interface WizardStepperProps {
  steps: readonly WizardStepDefinition[];
  currentIndex: number;
  onStepSelect: (index: number) => void;
  disabled?: boolean;
}

export function WizardStepper({
  steps,
  currentIndex,
  onStepSelect,
  disabled = false,
}: WizardStepperProps) {
  const progressPercent =
    steps.length > 1 ? (currentIndex / (steps.length - 1)) * 100 : 100;

  return (
    <nav aria-label="Stream creation progress" className="w-full">
      <ol className="relative flex items-start justify-between gap-2">
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-4 hidden h-0.5 bg-zinc-700 sm:block"
        >
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {steps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isNavigable = index <= currentIndex && !disabled;

          return (
            <li
              key={step.id}
              className="relative z-10 flex min-w-0 flex-1 flex-col items-center text-center"
            >
              <button
                type="button"
                onClick={() => onStepSelect(index)}
                disabled={!isNavigable}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${step.title}`}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900",
                  "disabled:cursor-not-allowed",
                  isComplete &&
                    "border-purple-500 bg-purple-500 text-white hover:bg-purple-400",
                  isCurrent &&
                    "border-purple-400 bg-zinc-900 text-purple-300 ring-4 ring-purple-500/20",
                  !isComplete &&
                    !isCurrent &&
                    "border-zinc-700 bg-zinc-800 text-zinc-500"
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </button>

              <span
                className={cn(
                  "mt-2 truncate text-xs font-medium sm:text-sm",
                  isCurrent ? "text-zinc-100" : "text-zinc-500"
                )}
              >
                {step.title}
              </span>
              <span className="mt-1 hidden text-[11px] text-zinc-500 lg:block">
                {step.description}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default WizardStepper;
