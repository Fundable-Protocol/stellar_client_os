"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, ArrowLeft, ExternalLink } from "lucide-react";
import {
  NetworkError,
  TransactionError,
  ContractError,
  InsufficientFundsError,
} from "@/services/errors";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OfframpError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Offramp error:", error);
  }, [error]);

  const getErrorDetails = () => {
    // Check for bridge-specific errors
    const isBridgeError = error.message.includes("bridge") || 
                          error.message.includes("Allbridge") ||
                          error.message.includes("Polygon");

    if (error instanceof NetworkError) {
      return {
        title: "Network Connection Failed",
        message: "Unable to connect to the bridge network.",
        action: "Check your internet connection and try again.",
        showBridgeStatus: true,
      };
    }

    if (isBridgeError) {
      return {
        title: "Bridge Connection Error",
        message: error.message || "Failed to connect to the Stellar-Polygon bridge.",
        action: "The bridge service may be temporarily unavailable. Please try again later.",
        showBridgeStatus: true,
      };
    }

    if (error instanceof ContractError) {
      return {
        title: "Contract Interaction Failed",
        message: error.message || "Failed to interact with the bridge contract.",
        action: "The contract operation could not be completed. Please verify your parameters.",
        showBridgeStatus: false,
      };
    }

    if (error instanceof TransactionError) {
      return {
        title: "Transaction Failed",
        message: error.message || "The offramp transaction could not be processed.",
        action: error.txHash 
          ? "Your transaction was submitted but failed. Check the transaction hash for details."
          : "Please check your transaction details and try again.",
        showBridgeStatus: false,
      };
    }

    if (error instanceof InsufficientFundsError) {
      return {
        title: "Insufficient Funds",
        message: "You don't have enough funds for this offramp transaction.",
        action: "Please ensure you have enough tokens plus gas fees for the bridge.",
        showBridgeStatus: false,
      };
    }

    return {
      title: "Offramp Error",
      message: error.message || "An error occurred during the offramp process.",
      action: "Please try again. If the problem persists, contact support.",
      showBridgeStatus: false,
    };
  };

  const errorDetails = getErrorDetails();

  return (
    <div className="min-h-[80vh] bg-zinc-900 flex items-center justify-center p-4">
      <div className="max-w-xl w-full">
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-red-500/10 rounded-full">
              <AlertCircle className="h-12 w-12 text-red-400" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-zinc-50 text-center mb-3">
            {errorDetails.title}
          </h2>

          {/* Message */}
          <p className="text-zinc-300 text-center mb-2">
            {errorDetails.message}
          </p>

          {/* Action */}
          <p className="text-sm text-zinc-400 text-center mb-6">
            {errorDetails.action}
          </p>

          {/* Bridge Status Link */}
          {errorDetails.showBridgeStatus && (
            <div className="mb-6 p-3 bg-zinc-900/50 border border-zinc-700 rounded-lg">
              <p className="text-xs text-zinc-400 text-center mb-2">
                Check bridge service status:
              </p>
              <a
                href="https://core.allbridge.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-sm text-purple-400 hover:text-purple-300"
              >
                Allbridge Status
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Error Details (development only) */}
          {process.env.NODE_ENV === "development" && (
            <details className="mb-6">
              <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-400 text-center mb-2">
                Show technical details
              </summary>
              <div className="bg-zinc-900 border border-zinc-700 rounded p-3 overflow-auto max-h-40">
                <pre className="text-xs text-red-400 whitespace-pre-wrap break-words">
                  {error.stack || error.message}
                </pre>
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={reset}
              size="lg"
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>

            <Button
              onClick={() => (window.location.href = "/dashboard")}
              size="lg"
              variant="ghost"
              className="w-full text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>

        {/* Help Text */}
        <p className="text-center text-xs text-zinc-500 mt-4">
          Offramp transactions involve cross-chain bridges which may take longer than usual.
        </p>
      </div>
    </div>
  );
}
