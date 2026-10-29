/**
 * Types for Campaign Physical Reward Fulfillment and Shipping Addresses.
 *
 * Supports CSV bulk import for reward fulfillment, validation of shipping
 * addresses, error flagging, and per-backer row editing.
 */

export type ShippingStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";

export const SHIPPING_STATUSES: readonly ShippingStatus[] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export function isShippingStatus(value: unknown): value is ShippingStatus {
  return typeof value === "string" && (SHIPPING_STATUSES as readonly string[]).includes(value as ShippingStatus);
}

/** Structured shipping address details for a backer. */
export interface ShippingAddress {
  recipientName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone?: string;
}

/** A single reward fulfillment record associated with a campaign and backer. */
export interface RewardFulfillmentRecord extends ShippingAddress {
  id: string;
  campaignId: string;
  /** Backer Stellar address (G...) or backer account identifier. */
  backerAddress: string;
  /** Physical reward tier/title, e.g. "Tree Planting Kit", "Eco T-Shirt". */
  rewardTier: string;
  /** Current fulfillment/shipping status. */
  shippingStatus: ShippingStatus;
  /** Optional shipment carrier tracking number. */
  trackingNumber?: string;
  /** Optional creator or backer delivery notes. */
  notes?: string;
  /** Timestamp when the record was imported or created (Unix ms). */
  importedAt: number;
  /** Timestamp when the record was last modified (Unix ms). */
  updatedAt: number;
}

/** Input required to create or import a fulfillment record. */
export type RewardFulfillmentInput = Omit<RewardFulfillmentRecord, "id" | "campaignId" | "importedAt" | "updatedAt">;

/** A validation error detected in a CSV row. */
export interface CSVValidationError {
  row: number;
  field: string;
  message: string;
  value?: string;
}

/** A non-fatal validation warning detected in a CSV row. */
export interface CSVValidationWarning {
  row: number;
  field: string;
  message: string;
  value?: string;
}

/** A parsed CSV row with extracted data and validation diagnostics. */
export interface ParsedFulfillmentRow {
  rowNumber: number;
  rawData: Record<string, string>;
  record?: RewardFulfillmentInput;
  errors: CSVValidationError[];
  warnings: CSVValidationWarning[];
  isValid: boolean;
}

/** Aggregated result of importing and validating a fulfillment CSV file. */
export interface CSVImportResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  rows: ParsedFulfillmentRow[];
  errors: CSVValidationError[];
  warnings: CSVValidationWarning[];
  isValid: boolean;
}

/** CSV column mapping definition. */
export interface CSVColumnDefinition {
  key: keyof RewardFulfillmentInput;
  header: string;
  aliases: string[];
  required: boolean;
  description: string;
}
