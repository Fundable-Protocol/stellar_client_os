/**
 * Sanitization utilities for error reporting to prevent sensitive data exposure
 */

/**
 * Pattern to match Stellar public keys (G...)
 * Stellar public keys are 56 characters long and start with 'G'
 */
export const STELLAR_PUBLIC_KEY_PATTERN = /\bG[A-Z0-9]{55}\b/g;

/**
 * Pattern to match Stellar secret keys (S...)
 * Secret keys are 56 characters long and start with 'S'
 */
export const STELLAR_SECRET_KEY_PATTERN = /\bS[A-Z0-9]{55}\b/g;

/**
 * Pattern to match Stellar addresses in various formats
 * Includes GCKF...2BVN7 style truncated addresses
 */
const STELLAR_TRUNCATED_PATTERN = /\bG[A-Z0-9]{4}\.\.\.[A-Z0-9]{5}\b/g;

/**
 * Options for sanitization
 */
type SanitizeOptions = {
  /** Whether to mask the full key or keep a truncated version */
  maskFullKey?: boolean;
  /** Replacement string for masked keys */
  replacement?: string;
};

/**
 * Sanitize a string by masking Stellar public keys
 * 
 * @param input - The string to sanitize
 * @param options - Sanitization options
 * @returns The sanitized string with keys masked
 * 
 * @example
 * sanitizeErrorString('Error with account GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMN')
 * // Returns: 'Error with account [PUBLIC_KEY_REDACTED]'
 */
export function sanitizeErrorString(
  input: string,
  options: SanitizeOptions = {}
): string {
  if (!input || typeof input !== 'string') {
    return input;
  }

  const {
    maskFullKey = false,
    replacement = '[PUBLIC_KEY_REDACTED]',
  } = options;

  let sanitized = input;

  // Replace full public keys
  sanitized = sanitized.replace(STELLAR_PUBLIC_KEY_PATTERN, (match) => {
    if (maskFullKey) {
      return replacement;
    }
    // Keep first 4 and last 5 characters for debugging
    return `${match.slice(0, 4)}...${match.slice(-5)}`;
  });

  // Replace secret keys (always full mask for security)
  sanitized = sanitized.replace(STELLAR_SECRET_KEY_PATTERN, '[SECRET_KEY_REDACTED]');

  // Replace truncated public keys
  sanitized = sanitized.replace(STELLAR_TRUNCATED_PATTERN, replacement);

  return sanitized;
}

/**
 * Recursively sanitize an object by masking Stellar public keys in string values
 * 
 * @param obj - The object to sanitize
 * @param options - Sanitization options
 * @returns A new object with all string values sanitized
 */
export function sanitizeObject<T = unknown>(
  obj: T,
  options: SanitizeOptions = {}
): T {
  if (!obj) {
    return obj;
  }

  // Handle primitive values
  if (typeof obj === 'string') {
    return sanitizeErrorString(obj, options) as T;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'symbol') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options)) as T;
  }

  // Handle plain objects
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Don't sanitize keys, only values
      result[key] = sanitizeObject(value, options);
    }
    return result as T;
  }

  return obj;
}

/**
 * Sanitize an error object for safe telemetry reporting
 * 
 * @param error - The error object to sanitize
 * @param options - Sanitization options
 * @returns A sanitized copy of the error with safe properties
 */
export function sanitizeError(
  error: Error,
  options: SanitizeOptions = {}
): Error {
  const safeError = new Error(sanitizeErrorString(error.message, options));
  
  // Copy over safe properties
  safeError.name = sanitizeErrorString(error.name, options);
  safeError.stack = error.stack ? sanitizeErrorString(error.stack, options) : undefined;

  // Copy any custom properties if they exist
  const customProps = Object.getOwnPropertyNames(error).filter(
    (prop) => prop !== 'message' && prop !== 'name' && prop !== 'stack'
  );

  const errorRecord = error as Error & Record<string, unknown>;
  const safeErrorRecord = safeError as Error & Record<string, unknown>;

  for (const prop of customProps) {
    const value = errorRecord[prop];
    if (typeof value === 'string') {
      safeErrorRecord[prop] = sanitizeErrorString(value, options);
    } else if (value && typeof value === 'object') {
      safeErrorRecord[prop] = sanitizeObject(value, options);
    } else {
      safeErrorRecord[prop] = value;
    }
  }

  return safeError;
}