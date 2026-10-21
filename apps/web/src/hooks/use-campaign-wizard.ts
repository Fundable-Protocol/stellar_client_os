"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  CAMPAIGN_WIZARD_STEPS,
  CampaignWizardData,
  INITIAL_WIZARD_DATA,
  validateStep,
  WizardStepErrors,
  MilestoneItem,
  StretchGoalItem,
} from "@/components/modules/campaign/wizard/campaign-wizard-config";

export const MAX_CAMPAIGN_TAGS = 10;

export interface UseCampaignWizardReturn {
  stepIndex: number;
  currentStep: typeof CAMPAIGN_WIZARD_STEPS[number];
  steps: typeof CAMPAIGN_WIZARD_STEPS;
  data: CampaignWizardData;
  errors: WizardStepErrors;
  isFirstStep: boolean;
  isLastStep: boolean;
  isDirty: boolean;
  milestones: MilestoneItem[];
  previouslyUsedTags: string[];
  updateField: <K extends keyof CampaignWizardData>(field: K, value: CampaignWizardData[K]) => void;
  setCategory: (category: string) => void;
  addTag: (tag: string) => boolean;
  removeTag: (tag: string) => void;
  addMilestone: (milestone: Omit<MilestoneItem, "id">) => void;
  removeMilestone: (id: string) => void;
  addStretchGoal: (goal: Omit<StretchGoalItem, "id">) => void;
  removeStretchGoal: (id: string) => void;
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
  const [previouslyUsedTags, setPreviouslyUsedTags] = useState<string[]>([]);

  // Fetch previously used tags for autocomplete. Failures are non-fatal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/campaigns/tags");
        if (!res.ok) return;
        const json = await res.json();
        const tags: unknown = json?.tags ?? json?.data?.tags ?? [];
        if (!cancelled && Array.isArray(tags)) {
          setPreviouslyUsedTags(
            Array.from(
              new Set(
                tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
              )
            )
          );
        }
      } catch {
        // Autocomplete is best-effort; ignore network errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const setCategory = useCallback((category: string) => {
    setData((prev) => ({ ...prev, category }));
    setIsDirty(true);
    setErrors((prev) => {
      if (prev.category) {
        const next = { ...prev };
        delete next.category;
        return next;
      }
      return prev;
    });
  }, []);

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return false;
    let added = false;
    setData((prev) => {
      const existing = prev.tags ?? [];
      if (existing.length >= MAX_CAMPAIGN_TAGS) return prev;
      const lower = trimmed.toLowerCase();
      if (existing.some((t) => t.toLowerCase() === lower)) return prev;
      added = true;
      return { ...prev, tags: [...existing, trimmed] };
    });
    if (added) {
      setIsDirty(true);
      setErrors((prev) => {
        if (prev.tags) {
          const next = { ...prev };
          delete next.tags;
          return next;
        }
        return prev;
      });
    }
    return added;
  }, []);

  const removeTag = useCallback((tag: string) => {
    const lower = tag.trim().toLowerCase();
    setData((prev) => ({
      ...prev,
      tags: (prev.tags ?? []).filter((t) => t.toLowerCase() !== lower),
    }));
    setIsDirty(true);
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

  const addStretchGoal = useCallback((goal: Omit<StretchGoalItem, "id">) => {
    const newItem: StretchGoalItem = {
      ...goal,
      id: `sg-${Date.now()}`,
    };
    setData((prev) => ({
      ...prev,
      stretchGoals: [...(prev.stretchGoals ?? []), newItem],
    }));
    setIsDirty(true);
  }, []);

  const removeStretchGoal = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      stretchGoals: (prev.stretchGoals ?? []).filter((g) => g.id !== id),
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
    milestones: data.milestones,
    previouslyUsedTags,
    updateField,
    setCategory,
    addTag,
    removeTag,
    addMilestone,
    removeMilestone,
    addStretchGoal,
    removeStretchGoal,
    goNext,
    goBack,
    goToStep,
    validateCurrentStep,
    resetWizard,
  };
}
