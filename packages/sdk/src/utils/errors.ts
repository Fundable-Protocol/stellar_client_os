/**
 * Error handling utilities for Fundable Stellar smart contracts.
 *
 * Provides utilities to parse Soroban simulation errors and transaction result XDR
 * to deliver human-readable error messages to developers.
 */

import { xdr } from '@stellar/stellar-sdk';

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
  operation?: string;
  suggestion?: string;
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
 * Parses transaction result XDR to extract meaningful error information
 */
function parseTransactionResultXdr(resultXdr: string): {
  message: string;
  details?: string;
  suggestion?: string;
} {
  try {
    const result = xdr.TransactionResult.fromXDR(resultXdr, 'base64');
    
    if (result.result().switch() === xdr.TransactionResultCode.txFailed()) {
      const operations = result.result().results();
      if (operations && operations.length > 0) {
        const firstOp = operations[0];
        
        // Check for contract-specific errors
        if (firstOp.tr().switch() === xdr.HostFunctionType.invokeContract()) {
          const invokeResult = firstOp.tr().invokeResult();
          if (invokeResult.switch() === xdr.InvokeHostFunctionResultType.sorobanVal()) {
            const val = invokeResult.val();
            if (val.switch() === xdr.ScValType.error()) {
              const errorVal = val.error();
              if (errorVal.switch() === xdr.ScErrorType.contract()) {
                const contractCode = errorVal.contract().value();
                if (contractCode in CONTRACT_ERRORS) {
                  return {
                    message: CONTRACT_ERRORS[contractCode],
                    details: `Contract error code: ${contractCode}`,
                    suggestion: getSuggestionForErrorCode(contractCode),
                  };
                }
              }
            }
          }
        }
        
        // Check for other operation-specific errors
        const opResult = firstOp.tr();
        switch (opResult.switch()) {
          case xdr.OperationResultType.opBadAuth:
            return {
              message: "Authentication failed - invalid signature or insufficient permissions",
              suggestion: "Check that you're using the correct account and have signed the transaction properly",
            };
          case xdr.OperationResultType.opNoAccount:
            return {
              message: "Account does not exist",
              suggestion: "Ensure the account has been created and funded on the network",
            };
          case xdr.OperationResultType.opNotSupported:
            return {
              message: "Operation not supported",
              suggestion: "This operation may not be available on the current network or protocol version",
            };
          case xdr.OperationResultType.opTooEarly:
            return {
              message: "Transaction submitted before its valid time",
              suggestion: "Check the minTime parameter and system clock synchronization",
            };
          case xdr.OperationResultType.opTooLate:
            return {
              message: "Transaction submitted after its valid time",
              suggestion: "The transaction may have expired. Try creating a new transaction",
            };
          case xdr.OperationResultType.opMissingOperation:
            return {
              message: "Transaction contains no operations",
              suggestion: "Add at least one operation to the transaction",
            };
        }
      }
    }
    
    // If we can't parse specific details, return generic info
    return {
      message: "Transaction execution failed",
      details: `Result XDR: ${resultXdr.substring(0, 100)}...`,
      suggestion: "Check the transaction parameters and network conditions",
    };
  } catch (error) {
    return {
      message: "Failed to parse transaction result",
      details: `XDR parsing error: ${error instanceof Error ? error.message : String(error)}`,
      suggestion: "The transaction result may be corrupted or in an unexpected format",
    };
  }
}

/**
 * Provides user-friendly suggestions based on error codes
 */
function getSuggestionForErrorCode(code: number): string {
  const suggestions: Record<number, string> = {
    1: "The contract is already initialized. You can use it directly without re-initializing.",
    2: "The contract has not been initialized. Call the initialize() method first.",
    3: "Check that you're using the correct account with proper permissions for this operation.",
    4: "Ensure the amount is positive and within the valid range for this operation.",
    5: "Verify that the end time is after the start time for the stream.",
    6: "Check that the stream ID is correct and the stream exists.",
    7: "Only active streams can be modified. Check the stream status first.",
    8: "Only paused streams can be resumed. Check the stream status first.",
    9: "Streams can only be canceled when they are active or paused.",
    10: "Wait for more funds to accumulate in the stream or check the calculation.",
    11: "Ensure you have sufficient token balance and the token contract is working properly.",
    12: "The fee exceeds the maximum allowed. Try with a lower fee or check contract settings.",
    13: "Verify the recipient address is a valid Stellar address.",
    14: "The deposit amount exceeds the total stream capacity. Check the stream parameters.",
    15: "The calculation caused an overflow. Try with smaller numbers.",
    16: "Verify the delegate address is a valid Stellar address.",
  };
  
  return suggestions[code] || "Review the operation parameters and try again.";
}

/**
 * Parses Soroban simulation errors to extract meaningful information
 */
function parseSimulationError(errorMessage: string): {
  message: string;
  details?: string;
  suggestion?: string;
} {
  // Common simulation error patterns
  if (errorMessage.includes("insufficient fee")) {
    return {
      message: "Insufficient transaction fee",
      details: errorMessage,
      suggestion: "Increase the transaction fee and try again",
    };
  }
  
  if (errorMessage.includes("insufficient balance")) {
    return {
      message: "Insufficient account balance",
      details: errorMessage,
      suggestion: "Ensure the account has enough XLM to cover fees and operations",
    };
  }
  
  if (errorMessage.includes("contract error")) {
    const errorCode = extractErrorCode(errorMessage);
    if (errorCode !== null && errorCode in CONTRACT_ERRORS) {
      return {
        message: CONTRACT_ERRORS[errorCode],
        details: errorMessage,
        suggestion: getSuggestionForErrorCode(errorCode),
      };
    }
  }
  
  if (errorMessage.includes("XDR")) {
    return {
      message: "XDR encoding/decoding error",
      details: errorMessage,
      suggestion: "Check the transaction format and parameters",
    };
  }
  
  if (errorMessage.includes("timeout")) {
    return {
      message: "Simulation timeout",
      details: errorMessage,
      suggestion: "The operation may be too complex. Try simplifying or increase timeout",
    };
  }
  
  return {
    message: "Transaction simulation failed",
    details: errorMessage,
    suggestion: "Check the transaction parameters and network conditions",
  };
}

/**
 * Parses Soroban contract errors from various error formats
 * Handles simulation errors, transaction result errors, and generic errors
 */
export function parseContractError(error: unknown, operationContext?: string): ParsedContractError {
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
        suggestion: getSuggestionForErrorCode(errorCode),
        operation: operationContext,
        originalError: error,
      };
    }

    // Check for simulation error patterns
    if (errorMessage.includes("simulation") || errorMessage.includes("XDR")) {
      const parsed = parseSimulationError(errorMessage);
      return {
        type: "simulation_error",
        message: parsed.message,
        details: parsed.details,
        suggestion: parsed.suggestion,
        operation: operationContext,
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
        suggestion: "Check the transaction parameters and network conditions",
        operation: operationContext,
        originalError: error,
      };
    }

    return {
      type: "unknown",
      message: errorMessage || "An error occurred",
      operation: operationContext,
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
        suggestion: getSuggestionForErrorCode(errorCode),
        operation: operationContext,
        originalError: error,
      };
    }

    return {
      type: "unknown",
      message: error,
      operation: operationContext,
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
          suggestion: getSuggestionForErrorCode(errorCode),
          operation: operationContext,
          originalError: error,
        };
      }
    }

    // Check for transaction error response
    if (errorObj.resultXdr !== undefined) {
      const parsed = parseTransactionResultXdr(String(errorObj.resultXdr));
      return {
        type: "transaction_error",
        message: parsed.message,
        details: parsed.details,
        suggestion: parsed.suggestion,
        operation: operationContext,
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
          suggestion: getSuggestionForErrorCode(errorCode),
          operation: operationContext,
          originalError: error,
        };
      }

      return {
        type: "unknown",
        message: message,
        operation: operationContext,
        originalError: error,
      };
    }

    return {
      type: "unknown",
      message: "An unknown error occurred",
      operation: operationContext,
      originalError: error,
    };
  }

  return {
    type: "unknown",
    message: "An unexpected error occurred",
    operation: operationContext,
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
  public readonly suggestion?: string;
  public readonly operation?: string;

  constructor(parsed: ParsedContractError) {
    super(parsed.message);
    this.name = "FundableStellarError";
    this.code = parsed.code;
    this.type = parsed.type;
    this.details = parsed.details;
    this.suggestion = parsed.suggestion;
    this.operation = parsed.operation;

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
    if (this.operation) {
      result += ` [Operation: ${this.operation}]`;
    }
    if (this.details) {
      result += `\nDetails: ${this.details}`;
    }
    if (this.suggestion) {
      result += `\nSuggestion: ${this.suggestion}`;
    }
    return result;
  }

  /**
   * Returns a user-friendly message without technical details
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Returns a user-friendly message with suggestion
   */
  getUserMessageWithSuggestion(): string {
    let result = this.message;
    if (this.suggestion) {
      result += `\n\n💡 ${this.suggestion}`;
    }
    return result;
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
    const parsed = parseContractError(error, operationName);
    const fundableError = new FundableStellarError(parsed);
    throw fundableError;
  }
}
