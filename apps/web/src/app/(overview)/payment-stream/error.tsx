"use client";

import { RouteErrorView } from "@/components/ui/route-error-view";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PaymentStreamError({ error, reset }: ErrorProps) {
  return (
    <RouteErrorView
      error={error}
      reset={reset}
      title="Payment Stream Error"
      description="We couldn't load the payment stream page."
    />
  );
}
