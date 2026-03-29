'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
import { ErrorFallback } from '@/components/ui/error-fallback';
import { reportRuntimeError } from '@/lib/error-reporting';

type RouteErrorViewProps = {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  homeHref?: string;
};

export function RouteErrorView({
  error,
  reset,
  title,
  description,
  homeHref = '/dashboard',
}: RouteErrorViewProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[RouteErrorView]', error);
    }
    reportRuntimeError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[80vh] bg-zinc-900 p-4 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-4">
        <ErrorFallback
          title={title}
          description={description}
          error={error}
          onRetry={reset}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 p-8 text-zinc-100"
        />

        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => (window.location.href = homeHref)}>
            <Home className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
