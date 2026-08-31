"use client";

import React, { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Save, Rocket, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCampaignWizard } from "@/hooks/use-campaign-wizard";
import { CampaignWizardStepper } from "./CampaignWizardStepper";
import {
  DetailsStep,
  GoalsStep,
  TimelineStep,
  ImpactStep,
  PreviewStep,
} from "./CampaignWizardSteps";
import type { CampaignWizardData } from "./campaign-wizard-config";

export interface CampaignWizardProps {
  onComplete?: (data: CampaignWizardData) => Promise<void> | void;
  onSaveDraft?: (data: CampaignWizardData) => Promise<void> | void;
  initialData?: Partial<CampaignWizardData>;
}

export function CampaignWizard({
  onComplete,
  onSaveDraft,
  initialData,
}: CampaignWizardProps) {
  const wizard = useCampaignWizard(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleNext = async () => {
    if (wizard.isLastStep) {
      if (wizard.validateCurrentStep()) {
        setIsSubmitting(true);
        try {
          if (onComplete) {
            await onComplete(wizard.data);
          }
          setIsSuccess(true);
        } catch (err) {
          console.error("Failed to create campaign:", err);
        } finally {
          setIsSubmitting(false);
        }
      }
      return;
    }

    wizard.goNext();
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      if (onSaveDraft) {
        await onSaveDraft({ ...wizard.data, isDraft: true });
      }
    } catch (err) {
      console.error("Failed to save draft:", err);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const stepProps = {
    data: wizard.data,
    errors: wizard.errors,
    updateField: wizard.updateField,
  };

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-emerald-800/50 bg-zinc-900/90 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-50">Campaign Created Successfully!</h2>
        <p className="mt-2 text-sm text-zinc-300">
          Your campaign <strong className="text-emerald-400">"{wizard.data.title}"</strong> has been created and prepared for launch on Stellar.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setIsSuccess(false);
              wizard.resetWizard();
            }}
            className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
          >
            Create Another Campaign
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Campaign creation wizard"
      className="mx-auto w-full max-w-4xl rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 shadow-2xl backdrop-blur-md sm:p-6 md:p-8"
    >
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5 gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-50 flex items-center gap-2">
            <Rocket className="h-6 w-6 text-purple-500" />
            Campaign Creation Wizard
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Step {wizard.stepIndex + 1} of {wizard.steps.length} — {wizard.currentStep.description}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSaveDraft}
          disabled={isSavingDraft || isSubmitting}
          className="border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800"
        >
          {isSavingDraft ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
          Save Draft
        </Button>
      </header>

      <CampaignWizardStepper
        steps={wizard.steps}
        currentIndex={wizard.stepIndex}
        onStepSelect={wizard.goToStep}
        disabled={isSubmitting}
      />

      <div className="mt-8 min-h-[320px]">
        {wizard.currentStep.id === "details" && <DetailsStep {...stepProps} />}
        {wizard.currentStep.id === "goals" && <GoalsStep {...stepProps} />}
        {wizard.currentStep.id === "timeline" && (
          <TimelineStep
            {...stepProps}
            addMilestone={wizard.addMilestone}
            removeMilestone={wizard.removeMilestone}
          />
        )}
        {wizard.currentStep.id === "impact" && <ImpactStep {...stepProps} />}
        {wizard.currentStep.id === "preview" && (
          <PreviewStep data={wizard.data} errors={wizard.errors} />
        )}
      </div>

      <footer className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-zinc-800/80 pt-5 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={wizard.goBack}
          disabled={wizard.isFirstStep || isSubmitting}
          className="h-11 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Button
          type="button"
          size="lg"
          onClick={handleNext}
          disabled={isSubmitting}
          className="h-11 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 font-semibold text-white shadow-lg shadow-purple-900/30 hover:from-purple-700 hover:to-blue-700"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Launching Campaign...
            </>
          ) : wizard.isLastStep ? (
            <>
              Launch Campaign
              <Rocket className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              Continue to {wizard.steps[wizard.stepIndex + 1]?.title}
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </footer>
    </section>
  );
}

export default CampaignWizard;
