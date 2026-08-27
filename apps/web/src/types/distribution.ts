/**
 * Type definitions for Token Distribution UI
 */

/**
 * Distribution type enum
 */
export type DistributionType = "equal" | "weighted";

/**
 * Recipient data structure
 */
export interface Recipient {
  /** Unique identifier for the recipient */
  id: string;
  /** Stellar address of the recipient */
  address: string;
  /** Amount for this recipient (required for weighted, calculated for equal) */
  amount?: string;
  /** Whether the recipient data is valid */
  isValid: boolean;
  /** Validation error message if any */
  validationError?: string;
  /** Whether the address is a duplicate */
  isDuplicate?: boolean;
  /** Warning message if any (e.g. duplicate address warning) */
  warning?: string;
}

/**
 * Distribution state interface
 */
export interface DistributionState {
  /** Type of distribution (equal or weighted) */
  type: DistributionType;
  /** List of recipients */
  recipients: Recipient[];
  /** Total amount for equal distribution */
  totalAmount: string;
  /** Whether the entire state is valid */
  isValid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
}

/**
 * Validation error interface
 */
export interface ValidationError {
  /** Field that has the error */
  field: string;
  /** Error message */
  message: string;
  /** Recipient ID if error is specific to a recipient */
  recipientId?: string;
}

/**
 * Transaction summary for confirmation
 */
export interface TransactionSummary {
  /** Distribution type */
  type: DistributionType;
  /** Number of recipients */
  recipientCount: number;
  /** Total amount to be distributed */
  totalAmount: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Estimated transaction fee */
  estimatedFee: string;
}

/**
 * CSV processing error
 */
export interface CSVError {
  /** Line number where error occurred */
  line: number;
  /** Column name if applicable */
  column?: string;
  /** Error message */
  message: string;
  /** Invalid value that caused the error */
  value?: string;
}

/**
 * CSV processing warning
 */
export interface CSVWarning {
  /** Line number where warning occurred */
  line: number;
  /** Warning message */
  message: string;
  /** Value that caused the warning */
  value?: string;
}

/**
 * CSV validation result
 */
export interface CSVValidationResult {
  /** Whether the CSV is valid */
  isValid: boolean;
  /** List of errors found */
  errors: CSVError[];
  /** List of warnings found */
  warnings: CSVWarning[];
  /** Successfully parsed recipients */
  recipients: Recipient[];
}

/**
 * Distribution operation for service integration
 */
export interface DistributionOperation {
  /** Distribution type */
  type: DistributionType;
  /** Token contract address */
  token: string;
  /** List of recipient addresses */
  recipients: string[];
  /** List of amounts (for weighted) or single total amount (for equal) */
  amounts: string[];
}