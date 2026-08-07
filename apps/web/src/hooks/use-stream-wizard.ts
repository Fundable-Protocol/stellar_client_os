"use client";

import { useCallback, useMemo, useState } from "react";
import {
  WIZARD_STEPS,
  createInitialWizardData,
  validateWizardStep,
  type WizardErrors,
  type WizardStreamData,
} from "@/components/modules/payment-stream/wizard/wizard-config";

interface UseStreamWizardOptions {
  defaultToken: string;
  defaultDurationUnit: string;
}

export function useStreamWizard({
  defaultToken,
  defaultDurationUnit,
}: UseStreamWizardOptions) {
  const initialData = useMemo(
    () => createInitialWizardData(defaultToken, defaultDurationUnit),
    [defaultToken, defaultDurationUnit]
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<WizardStreamData>(initialData);
  const [errors, setErrors] = useState<WizardErrors>({});

  const currentStep = WIZARD_STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;

  const updateField = useCallback(
    <K extends keyof WizardStreamData>(key: K, value: WizardStreamData[K]) => {
      setData((prev) => ({ ...prev, [key]: value }));
      // Clear the field error as soon as the creator edits it — stale errors on a
      // field being actively corrected read as broken validation.
      setErrors((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  const validateCurrentStep = useCallback(() => {
    const stepErrors = validateWizardStep(currentStep.id, data);
    setErrors(stepErrors);
    return Object.keys(stepErrors).length === 0;
  }, [currentStep.id, data]);

  const goNext = useCallback(() => {
    if (!validateCurrentStep()) return false;

    setStepIndex((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
    return true;
  }, [validateCurrentStep]);

  const goBack = useCallback(() => {
    setErrors({});
    setStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      // Only steps already reached are navigable, so a creator can revise an
      // earlier answer without skipping validation of steps ahead.
      if (index < 0 || index > stepIndex) return;
      setErrors({});
      setStepIndex(index);
    },
    [stepIndex]
  );

  const reset = useCallback(() => {
    setData(initialData);
    setErrors({});
    setStepIndex(0);
  }, [initialData]);

  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(initialData),
    [data, initialData]
  );

  return {
    steps: WIZARD_STEPS,
    stepIndex,
    currentStep,
    isFirstStep,
    isLastStep,
    data,
    errors,
    isDirty,
    setData,
    updateField,
    validateCurrentStep,
    goNext,
    goBack,
    goToStep,
    reset,
  };
}

export type StreamWizardState = ReturnType<typeof useStreamWizard>;
