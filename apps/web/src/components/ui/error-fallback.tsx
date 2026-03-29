'use client';

import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

type ErrorFallbackProps = {
  title?: string;
  description?: string;
  error?: Error | null;
  onRetry: () => void;
  className?: string;
};

export function ErrorFallback({
  title = 'Something went wrong',
  description = 'An unexpected error occurred while loading this section.',
  error,
  onRetry,
  className,
}: ErrorFallbackProps) {
  return (
    <div className={className || 'w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-6 text-zinc-100'}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-red-500/10 p-3">
          <AlertCircle className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-400">{description}</p>

        {process.env.NODE_ENV === 'development' && error?.message ? (
          <pre className="max-h-32 w-full overflow-auto rounded bg-zinc-900 p-3 text-left text-xs text-red-300">
            {error.message}
          </pre>
        ) : null}

        <Button onClick={onRetry} className="mt-2">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    </div>
  );
}