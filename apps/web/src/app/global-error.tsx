"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-zinc-950 text-white">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-sm text-zinc-400">
            The application reported this error to the engineering team. Try again, or reload the page if the problem continues.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-fundable-purple-2 px-4 py-2 text-sm font-medium text-white hover:bg-fundable-purple-2/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fundable-purple-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
