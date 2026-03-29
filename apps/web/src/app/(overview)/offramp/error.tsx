"use client";

import { RouteErrorView } from "@/components/ui/route-error-view";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OfframpError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorView
      error={error}
      reset={reset}
      title="Offramp Error"
      description="We couldn't load the offramp page."
    />
  );
}
