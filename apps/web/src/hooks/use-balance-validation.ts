import { useState, useEffect, useRef } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Clear immediately when input is empty
    if (!amount || !balance) {
      setError(null);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      const inputNum = parseFloat(amount);
      const balanceNum = parseFloat(balance);

      if (isNaN(inputNum) || inputNum <= 0) {
        setError(null);
        return;
      }

      if (inputNum > balanceNum) {
        setError(
          `Insufficient ${tokenCode} balance. Available: ${balance}`
        );
      } else {
        setError(null);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [amount, balance, tokenCode, delay]);

  return {
    balanceError: error,
    insufficientBalance: !!error,
    isLoadingBalance: isLoading,
    availableBalance: balance,
  };
}
