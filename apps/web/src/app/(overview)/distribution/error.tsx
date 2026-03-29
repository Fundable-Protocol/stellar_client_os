'use client';

import { RouteErrorView } from '@/components/ui/route-error-view';

export default function DistributionError({
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
      title="Distribution Error"
      description="We couldn't load the distribution page."
    />
  );
}
