'use client';

import React, { type ErrorInfo, type ReactNode } from 'react';
import { reportRuntimeError } from '@/lib/error-reporting';
import { ErrorFallback } from '@/components/ui/error-fallback';

type FallbackRenderProps = {
  error: Error;
  reset: () => void;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode | ((props: FallbackRenderProps) => ReactNode);
  resetKeys?: unknown[];
  onReset?: () => void;
  onError?: (error: Error, info: ErrorInfo) => void;
  boundaryName?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

function areResetKeysEqual(prev: unknown[] = [], next: unknown[] = []): boolean {
  if (prev.length !== next.length) return false;
  return prev.every((value, index) => Object.is(value, next[index]));
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[ErrorBoundary:${this.props.boundaryName || 'unnamed'}]`, error, info);
    }

    reportRuntimeError(error, {
      boundaryName: this.props.boundaryName,
      componentStack: info.componentStack,
    });

    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (!this.state.error) return;
    if (!areResetKeysEqual(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    const { fallback } = this.props;

    if (typeof fallback === 'function') {
      return fallback({ error, reset: this.reset });
    }

    if (fallback) {
      return fallback;
    }

    return <ErrorFallback error={error} onRetry={this.reset} />;
  }
}
