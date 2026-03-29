type ErrorContext = {
  boundaryName?: string;
  componentStack?: string;
  digest?: string;
};

export function reportRuntimeError(error: Error, context: ErrorContext = {}): void {
  if (process.env.NODE_ENV !== 'production' || typeof window === 'undefined') {
    return;
  }

  const payload = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    boundaryName: context.boundaryName,
    componentStack: context.componentStack,
    digest: context.digest,
    path: window.location.pathname,
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