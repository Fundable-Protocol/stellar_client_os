import { sanitizeError, sanitizeObject, sanitizeErrorString } from './sanitize-error';

type ErrorContext = {
  boundaryName?: string;
  componentStack?: string;
  digest?: string;
};

/**
 * Report a runtime error to the configured error reporting endpoint
 * All sensitive data (Stellar public keys, secret keys) are automatically sanitized
 * before being sent to prevent data exposure in telemetry logs
 */
export function reportRuntimeError(error: Error, context: ErrorContext = {}): void {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') {
    return;
  }

  // Sanitize the error to mask Stellar public keys and secret keys
  const sanitizedError = sanitizeError(error);

  // Sanitize context values to ensure no keys leak through
  const sanitizedContext = sanitizeObject(context);

  // Build payload with sanitized values
  const payload = {
    name: sanitizedError.name,
    message: sanitizedError.message,
    stack: sanitizedError.stack,
    boundaryName: sanitizedContext.boundaryName,
    componentStack: sanitizedContext.componentStack,
    digest: sanitizedContext.digest,
    path: typeof window !== 'undefined' ? sanitizeErrorString(window.location.pathname) : undefined,
    timestamp: new Date().toISOString(),
  };

  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT;

  if (endpoint) {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
    return;
  }

  // Dispatch sanitized payload to prevent sensitive data exposure in custom events
  window.dispatchEvent(new CustomEvent('fundable:runtime-error', { detail: payload }));
}

/**
 * Report a caught error with additional context
 * Automatically sanitizes all data before reporting
 */
export function reportCaughtError(
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') {
    return;
  }

  // Convert unknown error to Error object
  const errorObj = error instanceof Error ? error : new Error(String(error));

  // Sanitize the error and context
  const sanitizedError = sanitizeError(errorObj);
  const sanitizedContext = sanitizeObject(context);

  const payload = {
    name: sanitizedError.name,
    message: sanitizedError.message,
    stack: sanitizedError.stack,
    context: sanitizedContext,
    path: typeof window !== 'undefined' ? sanitizeErrorString(window.location.pathname) : undefined,
    timestamp: new Date().toISOString(),
  };

  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT;

  if (endpoint) {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
    return;
  }

  window.dispatchEvent(new CustomEvent('fundable:runtime-error', { detail: payload }));
}