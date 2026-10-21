import { z } from 'zod'
import { env } from './env'
import { StellarService } from './stellar'
import { validateContractId } from './stream-validation'
import { MAX_LIVE_STREAM_URL_LENGTH, parseLiveStreamUrl } from './live-stream'

// Stream record type for display
export interface StreamRecord {
  id: string
  /** Numeric stream ID used for contract operations */
  contractStreamId: number
  sender: string
  recipient: string
  token: string
  tokenSymbol: string
  totalAmount: string
  withdrawnAmount: string
  startTime: number
  endTime: number
  /**
   * The on-chain lifecycle status of this stream.
   * "Confirming" is a transient client-side state used while the creation
   * transaction is still pending confirmation on the Stellar network.
   */
  status: "Active" | "Paused" | "Canceled" | "Completed" | "Confirming"
  cancelable: boolean
  transferable: boolean
  delegateAddress?: string | null
}

export const TOKEN_AMOUNT_REGEX = /^\d+(\.\d{1,7})?$/

export const paymentStreamSchema = z.object({
  recipientAddress: z
    .string()
    .min(1, "Recipient address is required")
    .refine((address) => StellarService.validateStellarAddress(address), "Please enter a valid Stellar public key"),
  
  token: z
    .string()
    .min(1, "Token selection is required")
    .refine(
      (val) => val === "native" || validateContractId(val),
      "Invalid token: must be 'native' or a valid Stellar contract ID"
    ),
  
  totalAmount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, "Amount must be a positive number")
    .refine((val) => TOKEN_AMOUNT_REGEX.test(val), "Amount cannot exceed 7 decimal places"),
  
  duration: z
    .string()
    .min(1, "Duration is required")
    .refine((val) => {
      const num = parseInt(val)
      return !isNaN(num) && num > 0
    }, "Duration must be a positive number"),
  
  durationUnit: z.enum(["hours", "days"]),
  
  cancelable: z.boolean(),
  transferable: z.boolean(),
})

export type PaymentStreamFormData = z.infer<typeof paymentStreamSchema>

/**
 * Schema for cloning an existing campaign.
 * Extends the payment stream schema with the original campaign reference
 * and species, preserving the goal (totalAmount) and timeline (duration/durationUnit).
 */
export const cloneCampaignSchema = paymentStreamSchema.extend({
  sourceCampaignId: z.string().min(1, "Source Campaign ID is required"),
  species: z.string().min(1, "Species is required"),
})

export type CloneCampaignFormData = z.infer<typeof cloneCampaignSchema>

export const insuranceClaimSchema = z.object({
  changedBy: z.string().min(1, "changedBy is required"),
  evidence: z.array(z.string().min(1, "Each evidence key must not be empty")).min(1, "At least one evidence file is required"),
  description: z.string().max(2000, "Description cannot exceed 2000 characters").optional(),
});

export type InsuranceClaimFormData = z.infer<typeof insuranceClaimSchema>;

export const SUPPORTED_TOKENS = [
  { value: "USDC", label: "USDC", address: "CBIELTK6YBZJU5UP2WWQEUCYKLUP6AUNZB2QTWFEIE5USCIHMXQDAMA" },
  { value: "USDT", label: "USDT", address: env.NEXT_PUBLIC_USDT_CONTRACT_ID },
  { value: "EURC", label: "EURC", address: env.NEXT_PUBLIC_EURC_CONTRACT_ID },
  { value: "XLM", label: "XLM (Native)", address: "native" },
  { value: "AQUA", label: "AQUA", address: "CAQCFVLOBK5GIULPPNZRGCALJIMZL5BSP7X5YJVMGCCPTUEPFM4AVSDF4Y" }
] as const

/** Only pairs with a configured Soroban token contract can be selected for a live transaction. */
export const CONFIGURED_ESCROW_TOKENS = SUPPORTED_TOKENS.filter(
  (token) => token.value === "XLM" || Boolean(token.address),
)

/**
 * Type representing a supported token entry
 */
export type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

/**
 * Resolve a token value or contract address to a display-friendly ticker symbol.
 * Looks up the input against both the `value` (e.g. "USDC") and `address`
 * (e.g. "CBIEPTKY6ZBZIU5U2PWWQEUCYKLUP6AUNZB2QTWFEE5USCIHYMQADAMA") fields
 * of SUPPORTED_TOKENS. Falls back to the raw input if no match is found.
 *
 * @param tokenOrAddress - Token value ("USDC") or contract address
 * @returns The ticker symbol ("USDC"), or the original input if unrecognised
 *
 * @example
 * gtetTokenSymbol("USDC")                               // "USDC"
 * getTokenSymbol("CBIEPTKY6ZBZIU5U2PWWQEUCYKLUP6AUNZB2QTWFEE5USCIHYMQADAMA") // "USDC"
 * getTokenSymbol("native")                              // "XLM"
 * getTokenSymbol("UNKNOWN")                             // "UNKNOWN"
 */
export function getTokenSymbol(tokenOrAddress: string): string {
  if (!tokenOrAddress) return tokenOrAddress

  // Try matching by value first (fast path for forms)
  const byValue = SUPPORTED_TOKENS.find((t) => t.value === tokenOrAddress)
  if (byValue) return byValue.value

  // Fall back to matching by contract address
  const byAddress = SUPPORTED_TOKENS.find((t) => t.address === tokenOrAddress)
  if (byAddress) return byAddress.value

  // Unrecognised - return as-is
  return tokenOrAddress
}

export const withdrawStreamSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, "Amount must be a positive number")
    .refine((val) => TOKEN_AMOUNT_REGEX.test(val), "Amount cannot exceed 7 decimal places"),
  
  withdrawTo: z
    .string()
    .min(1, "Withdraw address is required")
    .refine((address) => StellarService.validateStellarAddress(address), "Invalid Stellar address format"),
  
  useMax: z.boolean(),
  useSelf: z.boolean(),
})

export type WithdrawStreamFormData = z.infer<typeof withdrawStreamSchema>

export const depositStreamSchema = z.object({
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, "Amount must be a positive number")
    .refine((val) => TOKEN_AMOUNT_REGEX.test(val), "Amount cannot exceed 7 decimal places"),
})

export type DepositStreamFormData = z.infer<typeof depositStreamSchema>

/**
 * Schema for creators updating campaign details before launch (issue #721).
 * Allows updating name, description, goal amount, and deadline.
 */
export const updateCampaignSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().min(1, "Campaign name is required"),
  description: z.string().min(1, "Description is required"),
  goalAmount: z
    .string()
    .min(1, "Goal amount is required")
    .refine((val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num > 0
    }, "Goal amount must be a positive number")
    .refine((val) => TOKEN_AMOUNT_REGEX.test(val), "Goal amount cannot exceed 7 decimal places"),
  deadline: z.string().min(1, "Deadline is required"),
})

export type UpdateCampaignFormData = z.infer<typeof updateCampaignSchema>

/**
 * Primary categories a campaign can be assigned to (issue #1175).
 * Exposed as a filterable facet on the browse/search page.
 */
export const CAMPAIGN_CATEGORIES = [
  "Tech",
  "Art",
  "Social Impact",
  "Music",
  "Film",
  "Games",
  "Education",
  "Health",
  "Environment",
  "Other",
] as const

export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number]

/** Maximum number of custom tags a campaign may carry. */
export const MAX_CAMPAIGN_TAGS = 10
/** Maximum number of funding milestones a campaign may define. */
export const MAX_CAMPAIGN_MILESTONES = 10

/**
 * Schema for a single funding milestone (issue #1171).
 * `percentage` is an integer between 1 and 100; `amount` is optional and,
 * when provided, must be a positive token amount.
 */
export const campaignMilestoneSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Milestone label is required")
    .max(80, "Milestone label cannot exceed 80 characters"),
  percentage: z
    .number({ invalid_type_error: "Percentage must be a number" })
    .int("Percentage must be a whole number")
    .min(1, "Percentage must be at least 1")
    .max(100, "Percentage cannot exceed 100"),
  amount: z
    .string()
    .trim()
    .refine((val) => val === "" || (parseFloat(val) > 0 && TOKEN_AMOUNT_REGEX.test(val)), {
      message: "Amount must be a positive number with at most 7 decimal places",
    })
    .optional(),
})

export type CampaignMilestoneFormData = z.infer<typeof campaignMilestoneSchema>

/**
 * Schema for the full list of campaign milestones.
 * Enforces a maximum count and unique percentages.
 */
export const campaignMilestonesSchema = z
  .array(campaignMilestoneSchema)
  .max(MAX_CAMPAIGN_MILESTONES, `A campaign can define at most ${MAX_CAMPAIGN_MILESTONES} milestones`)
  .refine(
    (milestones) => new Set(milestones.map((m) => m.percentage)).size === milestones.length,
    "Milestone percentages must be unique",
  )

export type CampaignMilestonesFormData = z.infer<typeof campaignMilestonesSchema>

/** Schema for the campaign's primary category (issue #1175). */
export const campaignCategorySchema = z.enum(CAMPAIGN_CATEGORIES, {
  errorMap: () => ({ message: "Please select a valid campaign category" }),
})

export type CampaignCategoryFormData = z.infer<typeof campaignCategorySchema>

/**
 * Schema for the campaign's custom tags (issue #1175).
 * Tags are trimmed, limited to 1-30 characters, deduplicated
 * case-insensitively, and capped at MAX_CAMPAIGN_TAGS.
 */
export const campaignTagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Tag cannot be empty")
      .max(30, "Tag cannot exceed 30 characters"),
  )
  .max(MAX_CAMPAIGN_TAGS, `A campaign can have at most ${MAX_CAMPAIGN_TAGS} tags`)
  .refine(
    (tags) => new Set(tags.map((t) => t.toLowerCase())).size === tags.length,
    "Tags must be unique",
  )

export type CampaignTagsFormData = z.infer<typeof campaignTagsSchema>

/**
 * Combined metadata schema used by the campaign creation wizard to validate
 * category, tags and funding milestones together.
 */
export const campaignMetadataSchema = z.object({
  category: campaignCategorySchema,
  tags: campaignTagsSchema,
  milestones: campaignMilestonesSchema,
})

export type CampaignMetadataFormData = z.infer<typeof campaignMetadataSchema>

/**
 * Currencies a backer may pledge in (issue #1170).
 * USD and EUR are fiat display currencies; XLM and USDC settle on Stellar.
 */
export const DONATION_CURRENCIES = ["USD", "EUR", "XLM", "USDC"] as const

export type DonationCurrency = (typeof DONATION_CURRENCIES)[number]

/** Number of decimal places each donation currency supports. */
export const DONATION_CURRENCY_PRECISION: Record<DonationCurrency, number> = {
  USD: 2,
  EUR: 2,
  XLM: 7,
  USDC: 7,
}

/** Schema for the backer's preferred donation currency. */
export const donationCurrencySchema = z.enum(DONATION_CURRENCIES, {
  errorMap: () => ({ message: "Please select a supported currency" }),
})

export type DonationCurrencyFormData = z.infer<typeof donationCurrencySchema>

/**
 * Build a regex that accepts a positive decimal with at most `decimals`
 * fractional digits.
 */
function amountRegexFor(decimals: number): RegExp {
  return new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`)
}

/**
 * Validate a donation amount string against the precision of the given
 * currency. Returns true when the amount is a positive number with no more
 * fractional digits than the currency supports.
 */
export function isValidDonationAmount(amount: string, currency: DonationCurrency): boolean {
  if (!amountRegexFor(DONATION_CURRENCY_PRECISION[currency]).test(amount)) return false
  return parseFloat(amount) > 0
}

/**
 * Schema for a single donation amount (issue #1170).
 * Precision is validated against the selected currency.
 */
export const donationAmountSchema = z
  .object({
    amount: z.string().min(1, "Amount is required"),
    currency: donationCurrencySchema,
  })
  .refine((data) => isValidDonationAmount(data.amount, data.currency), {
    message: "Amount must be a positive number with valid precision for the selected currency",
    path: ["amount"],
  })

export type DonationAmountFormData = z.infer<typeof donationAmountSchema>

/**
 * Schema for the multi-currency donation form (issue #1170).
 * Carries the backer's original currency, the currency the pledge is
 * converted into, and the amount entered in the original currency.
 */
export const donationFormSchema = z
  .object({
    originalCurrency: donationCurrencySchema,
    convertedCurrency: donationCurrencySchema,
    amount: z.string().min(1, "Amount is required"),
  })
  .refine((data) => isValidDonationAmount(data.amount, data.originalCurrency), {
    message: "Amount must be a positive number with valid precision for the selected currency",
    path: ["amount"],
  })

export type DonationFormData = z.infer<typeof donationFormSchema>

