import { z } from "zod";

export type CampaignWizardStepId = "details" | "goals" | "timeline" | "impact" | "preview";

export interface CampaignWizardStepDef {
  id: CampaignWizardStepId;
  title: string;
  subtitle: string;
  description: string;
}

export const CAMPAIGN_WIZARD_STEPS: readonly CampaignWizardStepDef[] = [
  {
    id: "details",
    title: "Details",
    subtitle: "Step 1",
    description: "Provide general campaign information and title",
  },
  {
    id: "goals",
    title: "Goals",
    subtitle: "Step 2",
    description: "Set your target funding amount and token choice",
  },
  {
    id: "timeline",
    title: "Timeline",
    subtitle: "Step 3",
    description: "Define start/end dates and key milestones",
  },
  {
    id: "impact",
    title: "Impact",
    subtitle: "Step 4",
    description: "Describe your impact statement and metrics",
  },
  {
    id: "preview",
    title: "Preview",
    subtitle: "Step 5",
    description: "Review your campaign before launching",
  },
] as const;

export interface MilestoneItem {
  id: string;
  title: string;
  targetDate: string;
  description: string;
}

export interface CampaignWizardData {
  // Step 1: Details
  title: string;
  category: string;
  shortDescription: string;
  fullStory: string;
  imageUrl: string;

  // Step 2: Goals
  goalAmount: string;
  token: string;
  targetBackers: string;
  minContribution: string;

  // Step 3: Timeline
  startDate: string;
  endDate: string;
  milestones: MilestoneItem[];

  // Step 4: Impact Statement
  impactStatement: string;
  targetBeneficiaries: string;
  co2OffsetTons: string;
  socialMetrics: string;

  // Metadata
  isDraft: boolean;
}

export const INITIAL_WIZARD_DATA: CampaignWizardData = {
  title: "",
  category: "environmental",
  shortDescription: "",
  fullStory: "",
  imageUrl: "",

  goalAmount: "",
  token: "XLM",
  targetBackers: "",
  minContribution: "10",

  startDate: new Date().toISOString().split("T")[0],
  endDate: new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0],
  milestones: [
    {
      id: "m-1",
      title: "Initial Launch & Onboarding",
      targetDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      description: "Setup operations and announce project kick-off.",
    },
  ],

  impactStatement: "",
  targetBeneficiaries: "",
  co2OffsetTons: "0",
  socialMetrics: "",

  isDraft: false,
};

export type WizardStepErrors = Record<string, string>;

// Zod schemas per step
export const detailsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title cannot exceed 100 characters"),
  category: z.string().min(1, "Please select a category"),
  shortDescription: z.string().min(10, "Short description must be at least 10 characters").max(300, "Short description cannot exceed 300 characters"),
  fullStory: z.string().min(20, "Full story must be at least 20 characters"),
  imageUrl: z.string().url("Must be a valid image URL").or(z.string().length(0)),
});

export const goalsSchema = z.object({
  goalAmount: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Goal amount must be a positive number"),
  token: z.string().min(1, "Token is required"),
  targetBackers: z.string().refine((val) => val === "" || (!isNaN(Number(val)) && Number(val) >= 0), "Backers count must be a non-negative number"),
  minContribution: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, "Min contribution must be non-negative"),
});

export const timelineSchema = z.object({
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
}).refine((data) => new Date(data.endDate) > new Date(data.startDate), {
  message: "End date must be after start date",
  path: ["endDate"],
});

export const impactSchema = z.object({
  impactStatement: z.string().min(10, "Impact statement must be at least 10 characters"),
  targetBeneficiaries: z.string().min(3, "Target beneficiaries description is required"),
  co2OffsetTons: z.string().refine((val) => val === "" || (!isNaN(Number(val)) && Number(val) >= 0), "CO2 offset must be non-negative"),
  socialMetrics: z.string().optional(),
});

export function validateStep(stepId: CampaignWizardStepId, data: CampaignWizardData): WizardStepErrors {
  const errors: WizardStepErrors = {};

  if (stepId === "details") {
    const result = detailsSchema.safeParse(data);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as string;
        if (path && !errors[path]) errors[path] = issue.message;
      });
    }
  } else if (stepId === "goals") {
    const result = goalsSchema.safeParse(data);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as string;
        if (path && !errors[path]) errors[path] = issue.message;
      });
    }
  } else if (stepId === "timeline") {
    const result = timelineSchema.safeParse(data);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as string;
        if (path && !errors[path]) errors[path] = issue.message;
      });
    }
  } else if (stepId === "impact") {
    const result = impactSchema.safeParse(data);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as string;
        if (path && !errors[path]) errors[path] = issue.message;
      });
    }
  } else if (stepId === "preview") {
    return {
      ...validateStep("details", data),
      ...validateStep("goals", data),
      ...validateStep("timeline", data),
      ...validateStep("impact", data),
    };
  }

  return errors;
}

export const CATEGORY_OPTIONS = [
  { label: "Environmental & Reforestation", value: "environmental" },
  { label: "Community & Social Impact", value: "community" },
  { label: "Open Source Tech & Infra", value: "tech" },
  { label: "Education & Literacy", value: "education" },
  { label: "Clean Energy & Water", value: "energy" },
];

export const TOKEN_OPTIONS = [
  { label: "Stellar Lumens (XLM)", value: "XLM" },
  { label: "USD Coin (USDC)", value: "USDC" },
  { label: "Euro Coin (EURC)", value: "EURC" },
];
