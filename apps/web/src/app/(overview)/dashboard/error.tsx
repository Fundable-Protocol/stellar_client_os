'use client';

import { RouteErrorView } from '@/components/ui/route-error-view';

export default function DashboardError({
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
      title="Dashboard Error"
      description="We couldn't render your dashboard right now."
    />
  );
}
