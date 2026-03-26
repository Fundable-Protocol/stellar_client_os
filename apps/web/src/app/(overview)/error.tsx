"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, WifiOff, AlertCircle } from "lucide-react";
import {
  NetworkError,
  TransactionError,
  ContractError,
  InsufficientFundsError,
  AccountNotFoundError,
  ValidationError,
} from "@/services/errors";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function OverviewError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console for debugging
    console.error("Overview route error:", error);
    
    // TODO: Send to error reporting service (e.g., Sentry)
    // reportError(error);
  }, [error]);

  // Determine error type and customize message
  const getErrorDetails = () => {
    if (error instanceof NetworkError) {
      return {
        icon: <WifiOff className="h-16 w-16 text-purple-400" />,
        title: "Connection Error",
        message: "Unable to connect to the Stellar network. Please check your internet connection and try again.",
        suggestion: "Make sure you're connected to the internet and the Stellar network is accessible.",
      };
    }

    if (error instanceof ContractError) {
      return {
        icon: <AlertCircle className="h-16 w-16 text-purple-400" />,
        title: "Contract Error",
        message: error.message || "Failed to interact with the smart contract.",
        suggestion: error.contractId 
          ? `Contract ID: ${error.contractId.slice(0, 10)}...${error.contractId.slice(-10)}`
          : "The contract may be unavailable or the operation is not supported.",
      };
    }

    if (error instanceof TransactionError) {
      return {
        icon: <AlertCircle className="h-16 w-16 text-purple-400" />,
        title: "Transaction Failed",
        message: error.message || "The transaction could not be completed.",
        suggestion: error.txHash 
          ? `Transaction Hash: ${error.txHash.slice(0, 10)}...${error.txHash.slice(-10)}`
          : "Please check your transaction parameters and try again.",
      };
    }

    if (error instanceof InsufficientFundsError) {
      return {
        icon: <AlertCircle className="h-16 w-16 text-purple-400" />,
        title: "Insufficient Funds",
        message: error.message || "You don't have enough funds for this transaction.",
        suggestion: "Please add more funds to your wallet and try again.",
      };
    }

    if (error instanceof AccountNotFoundError) {
      return {
        icon: <AlertCircle className="h-16 w-16 text-purple-400" />,
        title: "Account Not Found",
        message: error.message || "The specified account could not be found.",
        suggestion: "Please verify the account address and ensure it's activated on the Stellar network.",
      };
    }

    if (error instanceof ValidationError) {
      return {
        icon: <AlertCircle className="h-16 w-16 text-purple-400" />,
        title: "Validation Error",
        message: error.message || "The provided data is invalid.",
        suggestion: error.field 
          ? `Please check the ${error.field} field and try again.`
          : "Please verify your input and try again.",
      };
    }

    // Generic error
    return {
      icon: <AlertTriangle className="h-16 w-16 text-purple-400" />,
      title: "Something Went Wrong",
      message: error.message || "An unexpected error occurred.",
      suggestion: "Please try again. If the problem persists, contact support.",
    };
  };

  const errorDetails = getErrorDetails();

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            {errorDetails.icon}
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-zinc-50 mb-4">
            {errorDetails.title}
          </h1>

          {/* Message */}
          <p className="text-lg text-zinc-300 mb-3">
            {errorDetails.message}
          </p>

          {/* Suggestion */}
          <p className="text-sm text-zinc-400 mb-8">
            {errorDetails.suggestion}
          </p>

          {/* Error Details (for developers) */}
          {process.env.NODE_ENV === "development" && (
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-400 mb-2">
                Technical Details
              </summary>
              <div className="bg-zinc-900 border border-zinc-700 rounded p-4 overflow-auto">
                <pre className="text-xs text-red-400 whitespace-pre-wrap break-words">
                  {error.stack || error.message}
                </pre>
                {error.digest && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Error Digest: {error.digest}
                  </p>
                )}
              </div>
            </details>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={reset}
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button
              onClick={() => (window.location.href = "/")}
              size="lg"
              variant="outline"
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </div>

        {/* Help Text */}
        <p className="text-center text-sm text-zinc-500 mt-6">
          Need help? Check the{" "}
          <a
            href="https://github.com/Fundable-Protocol/stellar_client_os/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300 underline"
          >
            GitHub issues
          </a>{" "}
          or contact support.
        </p>
      </div>
    </div>
  );
}
