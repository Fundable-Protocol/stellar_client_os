/**
 * Error handling utilities for Fundable Stellar smart contracts.
 *
 * Provides utilities to parse Soroban simulation errors and transaction result XDR
 * to deliver human-readable error messages to developers.
 */

/**
 * Maps contract error codes to human-readable descriptions
 * Based on contract error enums in payment-stream and distributor contracts
 */
export const CONTRACT_ERRORS: Record<number, string> = {
  // Payment Stream Contract Errors
  1: "AlreadyInitialized - Contract has already been initialized",
  2: "NotInitialized - Contract has not been initialized",
  3: "Unauthorized - Caller does not have permission to perform this action",
  4: "InvalidAmount - Amount must be positive and within valid range",
  5: "InvalidTimeRange - End time must be after start time",
  6: "StreamNotFound - Stream ID does not exist",
  7: "StreamNotActive - Stream is not in active state",
  8: "StreamNotPaused - Stream is not in paused state",
  9: "StreamCannotBeCanceled - Stream cannot be canceled in its current state",
  10: "InsufficientWithdrawable - Insufficient withdrawable amount available",
  11: "TransferFailed - Token transfer operation failed",
  12: "FeeTooHigh - Protocol fee exceeds maximum allowed (5%)",
  13: "InvalidRecipient - Recipient address is invalid",
  14: "DepositExceedsTotal - Deposit amount exceeds stream total capacity",
  15: "ArithmeticOverflow - Numeric operation caused overflow",
  16: "InvalidDelegate - Delegate address is invalid",
};

/**
 * Represents a parsed Soroban contract error with context
 */
export interface ParsedContractError {
  type: "contract_error" | "simulation_error" | "transaction_error" | "unknown";
  code?: number;
  message: string;
  details?: string;
  originalError?: Error | string;
}

/**
 * Extracts error code from Soroban error message
 * Handles various formats: "Error: 7", "code: 7", etc.
 */
function extractErrorCode(errorString: string): number | null {
  // Try various patterns to extract error code
  const patterns = [
    /error[:\s]+(\d+)/i,
    /code[:\s]+(\d+)/i,
    /exit[:\s]+(\d+)/i,
    /Status\s+code[:\s]+(\d+)/i,
    /^(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = errorString.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

/**
 * Parses Soroban contract errors from various error formats
 * Handles simulation errors, transaction result errors, and generic errors
 */
export function parseContractError(error: unknown): ParsedContractError {
  // Handle null/undefined
  if (!error) {
    return {
      type: "unknown",
      message: "An unknown error occurred",
    };
  }

  // Handle Error objects
  if (error instanceof Error) {
    const errorMessage = error.message || "";
    const errorCode = extractErrorCode(errorMessage);

    if (errorCode !== null && errorCode in CONTRACT_ERRORS) {
      return {
        type: "contract_error",
        code: errorCode,
        message: CONTRACT_ERRORS[errorCode],
        details: errorMessage,
        originalError: error,
      };
    }

    // Check for simulation error patterns
    if (errorMessage.includes("simulation") || errorMessage.includes("XDR")) {
      return {
        type: "simulation_error",
        message: "Transaction simulation failed",
        details: errorMessage,
        originalError: error,
      };
    }

    // Check for transaction error patterns
    if (
      errorMessage.includes("transaction") ||
      errorMessage.includes("failed")
    ) {
      return {
        type: "transaction_error",
        message: "Transaction execution failed",
        details: errorMessage,
        originalError: error,
      };
    }

    return {
      type: "unknown",
      message: errorMessage || "An error occurred",
      originalError: error,
    };
  }

  // Handle string errors
  if (typeof error === "string") {
    const errorCode = extractErrorCode(error);

    if (errorCode !== null && errorCode in CONTRACT_ERRORS) {
      return {
        type: "contract_error",
        code: errorCode,
        message: CONTRACT_ERRORS[errorCode],
        originalError: error,
      };
    }

    return {
      type: "unknown",
      message: error,
      originalError: error,
    };
  }

  // Handle objects with error properties (response objects from SDK)
  if (typeof error === "object") {
    const errorObj = error as Record<string, unknown>;

    // Check for Soroban RPC error response
    if (errorObj.code !== undefined) {
      const errorCode = extractErrorCode(String(errorObj.code));
      if (errorCode !== null && errorCode in CONTRACT_ERRORS) {
        return {
          type: "contract_error",
          code: errorCode,
          message: CONTRACT_ERRORS[errorCode],
          details: String(errorObj.message || ""),
          originalError: error,
        };
      }
    }

    // Check for transaction error response
    if (errorObj.resultXdr !== undefined) {
      return {
        type: "transaction_error",
        message: "Transaction execution failed - check result XDR",
        details: String(errorObj.resultXdr),
        originalError: error,
      };
    }

    // Fallback to checking message property
    if (errorObj.message !== undefined) {
      const message = String(errorObj.message);
      const errorCode = extractErrorCode(message);

      if (errorCode !== null && errorCode in CONTRACT_ERRORS) {
        return {
          type: "contract_error",
          code: errorCode,
          message: CONTRACT_ERRORS[errorCode],
          details: message,
          originalError: error,
        };
      }

      return {
        type: "unknown",
        message: message,
        originalError: error,
      };
    }

    return {
      type: "unknown",
      message: "An unknown error occurred",
      originalError: error,
    };
  }

  return {
    type: "unknown",
    message: "An unexpected error occurred",
    originalError: error,
  };
}

/**
 * Custom error class for SDK operations
 * Provides structured error information to calling code
 */
export class FundableStellarError extends Error {
  public readonly code?: number;
  public readonly type: string;
  public readonly details?: string;

  constructor(parsed: ParsedContractError) {
    super(parsed.message);
    this.name = "FundableStellarError";
    this.code = parsed.code;
    this.type = parsed.type;
    this.details = parsed.details;

    // Set prototype for instanceof checks
    Object.setPrototypeOf(this, FundableStellarError.prototype);
  }

  /**
   * Returns a formatted error message suitable for logging or display
   */
  toString(): string {
    let result = `${this.name}: ${this.message}`;
    if (this.code !== undefined) {
      result += ` [Code: ${this.code}]`;
    }
    if (this.details) {
      result += `\nDetails: ${this.details}`;
    }
    return result;
  }

  /**
   * Returns a user-friendly message without technical details
   */
  getUserMessage(): string {
    return this.message;
  }
}

/**
 * Wrapper function to safely execute contract operations and handle errors
 * @param operation Async function that executes a contract operation
 * @param operationName Name of the operation for error context
 * @returns Result of the operation or throws FundableStellarError
 */
export async function executeWithErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string = "Contract operation",
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const parsed = parseContractError(error);
    const fundableError = new FundableStellarError(parsed);
    throw fundableError;
  }
}
