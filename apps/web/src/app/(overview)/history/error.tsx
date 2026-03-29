'use client';

import { RouteErrorView } from '@/components/ui/route-error-view';

export default function HistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorView
      error={error}
      reset={reset}
      title="History Error"
      description="We couldn't load your transaction history."
    />
  );
}
