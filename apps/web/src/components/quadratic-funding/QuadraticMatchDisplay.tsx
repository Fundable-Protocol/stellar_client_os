"use client";

import { useEffect, useState } from "react";
import { formatAmount } from "@/lib/utils";

interface QuadraticMatchDisplayProps {
  roundId: string;
  projectAddress: string;
  contributionAmount: string;
  tokenSymbol?: string;
}

/**
 * Real-time display of estimated matching funds during checkout.
 * Shows how much matching the contributor's donation will unlock using
 * the quadratic funding formula.
 */
export function QuadraticMatchDisplay({
  roundId,
  projectAddress,
  contributionAmount,
  tokenSymbol = "USDC",
}: QuadraticMatchDisplayProps) {
  const [estimatedMatch, setEstimatedMatch] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Debounce the API call to avoid too many requests
    const timeoutId = setTimeout(() => {
      if (contributionAmount && parseFloat(contributionAmount) > 0) {
        fetchEstimatedMatch();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [contributionAmount, roundId, projectAddress]);

  const fetchEstimatedMatch = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/quadratic-funding/estimate-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundId,
          projectAddress,
          contributionAmount,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch estimated match");
      }

      const data = await response.json();
      setEstimatedMatch(data.estimatedMatch);
    } catch (err) {
      console.error("Failed to estimate match:", err);
      setError("Unable to calculate matching estimate");
    } finally {
      setIsLoading(false);
    }
  };

  if (!contributionAmount || parseFloat(contributionAmount) <= 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-green-900">
            Quadratic Matching Estimate
          </h3>
          <p className="mt-1 text-xs text-green-700">
            Your contribution unlocks additional matching funds
          </p>
        </div>
        {isLoading && (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {estimatedMatch && !error && (
        <div className="mt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Your contribution:</span>
            <span className="font-medium text-gray-900">
              {formatAmount(contributionAmount)} {tokenSymbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Estimated match:</span>
            <span className="font-semibold text-green-600">
              +{formatAmount(estimatedMatch)} {tokenSymbol}
            </span>
          </div>
          <div className="border-t border-green-200 pt-2">
            <div className="flex justify-between text-base font-bold">
              <span className="text-gray-900">Total impact:</span>
              <span className="text-green-600">
                {formatAmount(
                  (parseFloat(contributionAmount) + parseFloat(estimatedMatch)).toString()
                )}{" "}
                {tokenSymbol}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500">
        <p>
          💡 Quadratic funding amplifies smaller donations and rewards broad
          community support. Your contribution matters!
        </p>
      </div>
    </div>
  );
}
