import { useState, useEffect, useRef, useMemo } from "react";
import { useTokenBalance } from "./use-token-balance";

/**
 * Debounced balance validation hook.
 *
 * Compares an input amount against the user's on-chain balance for the
 * settlement token (XLM or USDC). When the backer's selected display
 * currency differs from the settlement currency, the amount is validated
 * against the converted settlement amount and a warning is surfaced so the
 * UI can show the conversion before confirmation.
 */
export function useBalanceValidation(
  amount: string,
  tokenCode: string | undefined,
  delay = 300,
  options?: {
    /** Currency the backer selected at checkout (USD, EUR, XLM, USDC). */
    displayCurrency?: string;
    /** Amount in the settlement token after conversion. */
    convertedAmount?: string;
    /** Settlement token code (XLM or USDC). Defaults to `tokenCode`. */
    settlementTokenCode?: string;
  }
) {
  const settlementTokenCode = options?.settlementTokenCode ?? tokenCode;
  const { balance, isLoading } = useTokenBalance(settlementTokenCode);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const displayCurrency = options?.displayCurrency;
  const convertedAmount = options?.convertedAmount;

  // Warn when the backer's display currency differs from the settlement token
  const conversionWarning = useMemo(() => {
    if (!displayCurrency || !settlementTokenCode) return null;
    if (displayCurrency.toUpperCase() === settlementTokenCode.toUpperCase()) {
      return null;
    }
    return `You are paying in ${displayCurrency}; the pledge settles in ${settlementTokenCode}.`;
  }, [displayCurrency, settlementTokenCode]);

  // Compute error synchronously; debounce via effect side-effect only
  const error = useMemo(() => {
    if (!amount || !balance) return null;

    // Validate the converted settlement amount when a conversion is provided
    const amountToValidate = convertedAmount ?? amount;
    const inputNum = parseFloat(amountToValidate);
    const balanceNum = parseFloat(balance);

    if (isNaN(inputNum) || inputNum <= 0) {
      return null;
    }

    if (inputNum > balanceNum) {
      return `Insufficient ${settlementTokenCode} balance. Available: ${balance}`;
    }
    return null;
  }, [amount, convertedAmount, balance, settlementTokenCode]);

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
    conversionWarning,
  };
}
