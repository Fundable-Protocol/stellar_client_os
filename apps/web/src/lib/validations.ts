import { z } from "zod"
import { StellarService } from "./stellar"
import { validateContractId } from "./stream-validation"

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

export const SUPPORTED_TOKENS = [
  { value: "USDC", label: "USDC", address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA" },
  { value: "XLM", label: "XLM (Native)", address: "native" },
  { value: "AQUA", label: "AQUA", address: "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSDF4Y" },
] as const

/**
 * Type representing a supported token entry
 */
export type SupportedToken = (typeof SUPPORTED_TOKENS)[number]

/**
 * Resolve a token value or contract address to a display-friendly ticker symbol.
 * Looks up the input against both the `value` (e.g. "USDC") and `address`
 * (e.g. "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA") fields
 * of SUPPORTED_TOKENS. Falls back to the raw input if no match is found.
 *
 * @param tokenOrAddress - Token value ("USDC") or contract address
 * @returns The ticker symbol ("USDC"), or the original input if unrecognised
 *
 * @example
 * getTokenSymbol("USDC")                               // "USDC"
 * getTokenSymbol("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA") // "USDC"
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

  // Unrecognised — return as-is
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