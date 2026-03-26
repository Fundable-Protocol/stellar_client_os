"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw, ArrowLeft, Wallet } from "lucide-react";
import {
  NetworkError,
  TransactionError,
  ContractError,
  InsufficientFundsError,
  StreamNotFoundError,
} from "@/services/errors";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PaymentStreamError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Payment stream error:", error);
  }, [error]);

  const getErrorDetails = () => {
    if (error instanceof NetworkError) {
      return {
        title: "Network Connection Failed",
        message: "Unable to connect to the Stellar network.",
        action: "Check your connection and try again.",
        showWalletButton: false,
      };
    }

    if (error instanceof ContractError) {
      return {
        title: "Payment Stream Contract Error",
        message: error.message || "Failed to interact with the payment stream contract.",
        action: error.method 
          ? `The ${error.method} operation failed. Please verify your parameters.`
          : "The contract operation could not be completed.",
        showWalletButton: false,
      };
    }

    if (error instanceof TransactionError) {
      return {
        title: "Transaction Failed",
        message: error.message || "The payment stream transaction could not be processed.",
        action: error.resultCodes?.length 
          ? `Result codes: ${error.resultCodes.join(", ")}`
          : "Please check your transaction details and try again.",
        showWalletButton: false,
      };
    }

    if (error instanceof InsufficientFundsError) {
      return {
        title: "Insufficient Funds",
        message: "You don't have enough funds to create or manage this payment stream.",
        action: "Please add more funds to your wallet and try again.",
        showWalletButton: true,
      };
    }

    if (error instanceof StreamNotFoundError) {
      return {
        title: "Stream Not Found",
        message: `Payment stream ${error.streamId} could not be found.`,
        action: "The stream may have been canceled or completed. Please check your active streams.",
        showWalletButton: false,
      };
    }

    return {
      title: "Payment Stream Error",
      message: error.message || "An error occurred while processing your payment stream.",
      action: "Please try again. If the problem persists, contact support.",
      showWalletButton: false,
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

            {errorDetails.showWalletButton && (
              <Button
                onClick={() => {
                  // Trigger wallet modal or navigate to balances
                  window.location.href = "/balances";
                }}
                size="lg"
                variant="outline"
                className="w-full border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Check Wallet Balance
              </Button>
            )}

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
      </div>
    </div>
  );
}
