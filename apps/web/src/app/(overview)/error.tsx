"use client";

import { RouteErrorView } from "@/components/ui/route-error-view";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OverviewError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorView
      error={error}
      reset={reset}
      title="Overview Error"
      description="We couldn't render this overview route."
    />
  );
}
