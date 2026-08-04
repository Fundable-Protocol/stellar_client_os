"use client";

import { ArrowLeft, ArrowRight, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStreamWizard } from "@/hooks/use-stream-wizard";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { SUPPORTED_TOKENS } from "@/lib/validations";
import { WizardStepper } from "./WizardStepper";
import {
  CampaignDetailsStep,
  FundingStep,
  ReviewStep,
  ScheduleStep,
} from "./WizardSteps";
import type { WizardStreamData } from "./wizard-config";

export interface StreamWizardProps {
  onComplete: (data: WizardStreamData) => void | Promise<void>;
  isSubmitting?: boolean;
  estimatedFee?: string | null;
  isEstimatingFee?: boolean;
  tokenOptions?: { label: string; value: string }[];
}

const DEFAULT_TOKEN_OPTIONS = SUPPORTED_TOKENS.map((token) => ({
  label: token.label,
  value: token.value,
}));

export function StreamWizard({
  onComplete,
  isSubmitting = false,
  estimatedFee = null,
  isEstimatingFee = false,
  tokenOptions = DEFAULT_TOKEN_OPTIONS,
}: StreamWizardProps) {
  const wizard = useStreamWizard({
    defaultToken: tokenOptions[0]?.value ?? "XLM",
    defaultDurationUnit: "day",
  });

  useUnsavedChanges(wizard.isDirty && !isSubmitting);

  const handleNext = () => {
    if (wizard.isLastStep) {
      if (wizard.validateCurrentStep()) {
        void onComplete(wizard.data);
      }
      return;
    }

    wizard.goNext();
  };

  const stepProps = {
    data: wizard.data,
    errors: wizard.errors,
    updateField: wizard.updateField,
  };

  return (
    <section
      aria-label="Campaign funding and stream creation wizard"
      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 sm:p-5 md:p-6"
    >
      <header className="mb-6">
        <h2 className="mb-2 text-xl font-semibold text-zinc-50">
          Launch a Funding Stream
        </h2>
        <p className="text-sm text-zinc-400">
          Step {wizard.stepIndex + 1} of {wizard.steps.length} —{" "}
          {wizard.currentStep.description}
        </p>
      </header>

      <WizardStepper
        steps={wizard.steps}
        currentIndex={wizard.stepIndex}
        onStepSelect={wizard.goToStep}
        disabled={isSubmitting}
      />

      <div className="mt-8" role="group" aria-labelledby="wizard-step-heading">
        <h3 id="wizard-step-heading" className="sr-only">
          {wizard.currentStep.title}
        </h3>

        {wizard.currentStep.id === "campaign" && (
          <CampaignDetailsStep {...stepProps} />
        )}
        {wizard.currentStep.id === "funding" && (
          <FundingStep {...stepProps} tokenOptions={tokenOptions} />
        )}
        {wizard.currentStep.id === "schedule" && <ScheduleStep {...stepProps} />}
        {wizard.currentStep.id === "review" && (
          <ReviewStep
            data={wizard.data}
            estimatedFee={estimatedFee}
            isEstimatingFee={isEstimatingFee}
          />
        )}
      </div>

      <footer className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={wizard.goBack}
          disabled={wizard.isFirstStep || isSubmitting}
          className="h-12 min-h-[44px] w-full border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </Button>

        <Button
          type="button"
          size="lg"
          onClick={handleNext}
          disabled={isSubmitting}
          className="h-12 min-h-[44px] w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Creating stream…</span>
            </>
          ) : wizard.isLastStep ? (
            <>
              <span>Create stream</span>
              <Lock className="h-4 w-4" aria-hidden="true" />
            </>
          ) : (
            <>
              <span>Continue</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </footer>
    </section>
  );
}

export default StreamWizard;
