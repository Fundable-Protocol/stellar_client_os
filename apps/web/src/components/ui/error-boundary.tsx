'use client';

import React, { Component, ReactNode } from 'react';
import { reportRuntimeError } from '@/lib/error-reporting';

type FallbackRenderProps = {
  error: Error;
  reset: () => void;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode | ((props: FallbackRenderProps) => ReactNode);
  fallbackRender?: (props: FallbackRenderProps) => ReactNode;
  boundaryName?: string;
  onError?: (error: Error, componentStack: string) => void;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

const initialState: ErrorBoundaryState = {
  hasError: false,
  error: null,
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = initialState;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { boundaryName, onError } = this.props;

    // Report the error with sanitization automatically applied
    reportRuntimeError(error, {
      boundaryName: boundaryName,
      componentStack: errorInfo.componentStack ?? undefined,
    });

    if (onError) {
      onError(error, errorInfo.componentStack ?? "");
    }
  }

  reset = (): void => {
    this.setState(initialState);
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, fallbackRender } = this.props;

    if (hasError && error) {
      if (fallbackRender) {
        return fallbackRender({ error, reset: this.reset });
      }
      if (fallback) {
        return typeof fallback === "function"
          ? fallback({ error, reset: this.reset })
          : fallback;
      }
      // Default fallback
      return (
        <div className="p-4 text-center">
          <h2 className="text-lg font-semibold text-red-600">Something went wrong</h2>
          <p className="text-sm text-gray-500 mt-2">
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={this.reset}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}