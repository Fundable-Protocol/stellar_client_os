"use client";

import { useState, useCallback, useMemo } from "react";
import {
  CAMPAIGN_WIZARD_STEPS,
  CampaignWizardData,
  CampaignWizardStepId,
  INITIAL_WIZARD_DATA,
  validateStep,
  WizardStepErrors,
  MilestoneItem,
} from "@/components/modules/campaign/wizard/campaign-wizard-config";

export interface UseCampaignWizardReturn {
  stepIndex: number;
  currentStep: typeof CAMPAIGN_WIZARD_STEPS[number];
  steps: typeof CAMPAIGN_WIZARD_STEPS;
  data: CampaignWizardData;
  errors: WizardStepErrors;
  isFirstStep: boolean;
  isLastStep: boolean;
  isDirty: boolean;
  updateField: <K extends keyof CampaignWizardData>(field: K, value: CampaignWizardData[K]) => void;
  addMilestone: (milestone: Omit<MilestoneItem, "id">) => void;
  removeMilestone: (id: string) => void;
  goNext: () => boolean;
  goBack: () => void;
  goToStep: (index: number) => void;
  validateCurrentStep: () => boolean;
  resetWizard: () => void;
}

export function useCampaignWizard(initialData: Partial<CampaignWizardData> = {}): UseCampaignWizardReturn {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<CampaignWizardData>({
    ...INITIAL_WIZARD_DATA,
    ...initialData,
  });
  const [errors, setErrors] = useState<WizardStepErrors>({});
  const [isDirty, setIsDirty] = useState(false);

  const currentStep = useMemo(() => CAMPAIGN_WIZARD_STEPS[stepIndex], [stepIndex]);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === CAMPAIGN_WIZARD_STEPS.length - 1;

  const updateField = useCallback(<K extends keyof CampaignWizardData>(field: K, value: CampaignWizardData[K]) => {
    setData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    // Clear error for edited field
    setErrors((prev) => {
      if (prev[field as string]) {
        const next = { ...prev };
        delete next[field as string];
        return next;
      }
      return prev;
    });
  }, []);

  const addMilestone = useCallback((milestone: Omit<MilestoneItem, "id">) => {
    const newItem: MilestoneItem = {
      ...milestone,
      id: `m-${Date.now()}`,
    };
    setData((prev) => ({
      ...prev,
      milestones: [...prev.milestones, newItem],
    }));
    setIsDirty(true);
  }, []);

  const removeMilestone = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((m) => m.id !== id),
    }));
    setIsDirty(true);
  }, []);

  const validateCurrentStep = useCallback(() => {
    const stepErrors = validateStep(currentStep.id, data);
    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  }, [currentStep.id, data]);

  const goNext = useCallback(() => {
    const isValid = validateCurrentStep();
    if (isValid && !isLastStep) {
      setStepIndex((prev) => prev + 1);
      setErrors({});
      return true;
    }
    return isValid;
  }, [validateCurrentStep, isLastStep]);

  const goBack = useCallback(() => {
    if (!isFirstStep) {
      setStepIndex((prev) => prev - 1);
      setErrors({});
    }
  }, [isFirstStep]);

  const goToStep = useCallback(
    (targetIndex: number) => {
      if (targetIndex >= 0 && targetIndex < CAMPAIGN_WIZARD_STEPS.length) {
        // Can go backward anytime, or forward if current step passes validation
        if (targetIndex < stepIndex) {
          setStepIndex(targetIndex);
          setErrors({});
        } else {
          const isValid = validateCurrentStep();
          if (isValid) {
            setStepIndex(targetIndex);
            setErrors({});
          }
        }
      }
    },
    [stepIndex, validateCurrentStep]
  );

  const resetWizard = useCallback(() => {
    setData(INITIAL_WIZARD_DATA);
    setStepIndex(0);
    setErrors({});
    setIsDirty(false);
  }, []);

  return {
    stepIndex,
    currentStep,
    steps: CAMPAIGN_WIZARD_STEPS,
    data,
    errors,
    isFirstStep,
    isLastStep,
    isDirty,
    updateField,
    addMilestone,
    removeMilestone,
    goNext,
    goBack,
    goToStep,
    validateCurrentStep,
    resetWizard,
  };
}
