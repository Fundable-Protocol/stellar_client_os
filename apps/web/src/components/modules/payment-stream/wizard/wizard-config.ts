import { validateStellarAddress } from "@/utils/stellar-validation";
import { validateAmount } from "@/utils/amount-validation";
import { validateEndTime, type DurationUnit } from "@/lib/stream-validation";

export type WizardStepId = "campaign" | "funding" | "schedule" | "review";

export interface WizardStepDefinition {
  id: WizardStepId;
  title: string;
  description: string;
}

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  {
    id: "campaign",
    title: "Campaign",
    description: "Name the campaign this stream funds",
  },
  {
    id: "funding",
    title: "Funding",
    description: "Pick a token, amount and recipient",
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "Choose how long value is released over",
  },
  {
    id: "review",
    title: "Review",
    description: "Confirm the details before signing",
  },
] as const;

export interface WizardStreamData {
  campaignName: string;
  campaignDescription: string;
  recipient: string;
  token: string;
  amount: string;
  duration: string;
  durationUnit: string;
  cancellability: boolean;
  transferability: boolean;
}

export const createInitialWizardData = (
  defaultToken: string,
  defaultDurationUnit: string
): WizardStreamData => ({
  campaignName: "",
  campaignDescription: "",
  recipient: "",
  token: defaultToken,
  amount: "",
  duration: "",
  durationUnit: defaultDurationUnit,
  cancellability: true,
  transferability: false,
});

export type WizardErrors = Partial<Record<keyof WizardStreamData, string>>;

const MAX_CAMPAIGN_NAME_LENGTH = 60;
const MAX_CAMPAIGN_DESCRIPTION_LENGTH = 280;

function validateCampaignStep(data: WizardStreamData): WizardErrors {
  const errors: WizardErrors = {};

  if (!data.campaignName.trim()) {
    errors.campaignName = "Campaign name is required";
  } else if (data.campaignName.trim().length > MAX_CAMPAIGN_NAME_LENGTH) {
    errors.campaignName = `Campaign name must be ${MAX_CAMPAIGN_NAME_LENGTH} characters or less`;
  }

  if (data.campaignDescription.length > MAX_CAMPAIGN_DESCRIPTION_LENGTH) {
    errors.campaignDescription = `Description must be ${MAX_CAMPAIGN_DESCRIPTION_LENGTH} characters or less`;
  }

  return errors;
}

function validateFundingStep(data: WizardStreamData): WizardErrors {
  const errors: WizardErrors = {};

  const recipientError = validateStellarAddress(data.recipient);
  if (recipientError) {
    errors.recipient = recipientError;
  }

  const amountError = validateAmount(data.amount);
  if (amountError) {
    errors.amount = amountError;
  }

  if (!data.token) {
    errors.token = "Select a token to stream";
  }

  return errors;
}

function validateScheduleStep(data: WizardStreamData): WizardErrors {
  const errors: WizardErrors = {};

  const durationValue = Number(data.duration);
  if (!data.duration.trim()) {
    errors.duration = "Duration is required";
  } else if (!Number.isFinite(durationValue) || durationValue <= 0) {
    errors.duration = "Duration must be greater than 0";
  } else {
    const endTimeError = validateEndTime(null, data.duration, data.durationUnit);
    if (endTimeError) {
      errors.duration = endTimeError;
    }
  }

  return errors;
}

/**
 * Validation is per-step so the wizard can block navigation forward while still
 * letting a creator move back to revise an earlier answer.
 */
export function validateWizardStep(
  stepId: WizardStepId,
  data: WizardStreamData
): WizardErrors {
  switch (stepId) {
    case "campaign":
      return validateCampaignStep(data);
    case "funding":
      return validateFundingStep(data);
    case "schedule":
      return validateScheduleStep(data);
    case "review":
      return {
        ...validateCampaignStep(data),
        ...validateFundingStep(data),
        ...validateScheduleStep(data),
      };
    default:
      return {};
  }
}

export const DURATION_UNIT_OPTIONS: { label: string; value: DurationUnit }[] = [
  { label: "Hours", value: "hour" },
  { label: "Days", value: "day" },
  { label: "Weeks", value: "week" },
  { label: "Months", value: "month" },
  { label: "Years", value: "year" },
];
