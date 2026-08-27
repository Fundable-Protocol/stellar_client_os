import { useState, useEffect, useRef, useMemo } from "react";
import { useTokenBalance } from "./use-token-balance";

/**
 * Debounced balance validation hook.
 *
 * Compares an input amount against the user's on-chain balance for the
 * selected token. Returns an inline error string when the input exceeds
 * the balance, and an `insufficientBalance` flag to disable submit.
 */
export function useBalanceValidation(
  amount: string,
  tokenCode: string | undefined,
  delay = 300
) {
  const { balance, isLoading } = useTokenBalance(tokenCode);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Compute error synchronously; debounce via effect side-effect only
  const error = useMemo(() => {
    if (!amount || !balance) return null;

    const inputNum = parseFloat(amount);
    const balanceNum = parseFloat(balance);

    if (isNaN(inputNum) || inputNum <= 0) {
      return null;
    }

    if (inputNum > balanceNum) {
      return `Insufficient ${tokenCode} balance. Available: ${balance}`;
    }
    return null;
  }, [amount, balance, tokenCode]);

  // Keep a debounced version for actual validation display
  const [debouncedError, setDebouncedError] = useState<string | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setDebouncedError(error);
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [error, delay]);

  const finalError = debouncedError;

  return {
    error: finalError,
    insufficientBalance: !!finalError,
    isLoading,
  };
}
