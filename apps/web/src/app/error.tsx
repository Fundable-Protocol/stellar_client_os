"use client";

import { useEffect, useState } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [stackOpen, setStackOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  const isEnvError = error.message.includes("Environment variable validation failed");

  async function copyDigest() {
    if (!error.digest) return;
    try {
      await navigator.clipboard.writeText(error.digest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const textarea = document.createElement("textarea");
      textarea.value = error.digest;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-8 shadow-lg">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-red-600">
            {isEnvError ? "⚙️ Configuration Error" : "Something went wrong"}
          </h1>
        </div>

        <div className="mb-6">
          {isEnvError ? (
            <div>
              <p className="mb-4 text-gray-700">
                The application is missing required environment variables.
              </p>
              <pre className="overflow-x-auto rounded bg-gray-100 p-4 text-sm text-gray-800">
                {error.message}
              </pre>
              <div className="mt-4 rounded-lg bg-blue-50 p-4">
                <h3 className="mb-2 font-semibold text-blue-900">How to fix:</h3>
                <ol className="list-inside list-decimal space-y-1 text-sm text-blue-800">
                  <li>Copy <code className="rounded bg-blue-100 px-1">.env.example</code> to <code className="rounded bg-blue-100 px-1">.env.local</code></li>
                  <li>Fill in all required environment variables</li>
                  <li>Restart the development server</li>
                </ol>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-700">{error.message}</p>

              {/* Collapsible stack trace panel */}
              {error.stack && (
                <div className="mt-4">
                  <button
                    onClick={() => setStackOpen((prev) => !prev)}
                    aria-expanded={stackOpen}
                    className="flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    <span
                      aria-hidden="true"
                      className={`transition-transform duration-200 ${stackOpen ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                    {stackOpen ? "Hide" : "Show"} error details
                  </button>

                  {stackOpen && (
                    <pre className="mt-2 overflow-x-auto rounded bg-gray-100 p-4 text-xs text-gray-700 whitespace-pre-wrap break-words">
                      {error.stack}
                    </pre>
                  )}
                </div>
              )}

              {/* Copy digest button */}
              {error.digest && (
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    Error ID:{" "}
                    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-700">
                      {error.digest}
                    </code>
                  </span>
                  <button
                    onClick={copyDigest}
                    aria-label="Copy error digest to clipboard"
                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={reset}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
