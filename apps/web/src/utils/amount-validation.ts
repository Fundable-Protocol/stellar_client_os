/**
 * Amount validation and formatting utilities
 */

/**
 * Maximum decimal places allowed for token amounts
 */
export const MAX_DECIMAL_PLACES = 7;

/**
 * Validates if a string represents a valid positive number
 * @param amount - The amount string to validate
 * @returns true if the amount is valid, false otherwise
 */
export function isValidAmount(amount: string): boolean {
  // Use the detailed validation function and return true only if no error
  return validateAmount(amount) === null;
}

/**
 * Validates an amount and returns a detailed error message if invalid
 * @param amount - The amount string to validate
 * @returns null if valid, error message if invalid
 */
export function validateAmount(amount: string): string | null {
  if (!amount || typeof amount !== 'string') {
    return 'Amount is required';
  }

  const trimmed = amount.trim();
  if (trimmed === '') {
    return 'Amount cannot be empty';
  }

  if (trimmed !== amount) {
    return 'Amount cannot have leading or trailing whitespace';
  }

  // Check for invalid characters
  if (!/^[0-9]*\.?[0-9]*$/.test(trimmed)) {
    return 'Amount can only contain numbers and one decimal point';
  }

  // Check if it starts or ends with decimal point
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return 'Amount cannot start or end with a decimal point';
  }

  // Check for multiple decimal points
  const decimalCount = (trimmed.match(/\./g) || []).length;
  if (decimalCount > 1) {
    return 'Amount cannot have multiple decimal points';
  }

  const num = Number(trimmed);
  if (isNaN(num) || !isFinite(num)) {
    return 'Amount must be a valid number';
  }

  if (num <= 0) {
    return 'Amount must be greater than zero';
  }

  // Check decimal places
  const decimalIndex = trimmed.indexOf('.');
  if (decimalIndex !== -1) {
    const decimalPlaces = trimmed.length - decimalIndex - 1;
    if (decimalPlaces > MAX_DECIMAL_PLACES) {
      return `Amount cannot have more than ${MAX_DECIMAL_PLACES} decimal places`;
    }
  }

  return null;
}

/**
 * Formats an amount string to a consistent format
 * @param amount - The amount string to format
 * @returns Formatted amount string
 */
export function formatAmount(amount: string): string {
  if (!isValidAmount(amount)) {
    return amount;
  }

  const num = Number(amount.trim());
  const formatted = num.toFixed(MAX_DECIMAL_PLACES);
  
  // Remove trailing zeros and decimal point if not needed
  return formatted.replace(/\.?0+$/, '');
}

/**
 * Gets the number of decimal places in a number string
 * @param amount - The amount string
 * @returns Number of decimal places
 */
export function getDecimalPlaces(amount: string): number {
  const decimalIndex = amount.indexOf('.');
  return decimalIndex === -1 ? 0 : amount.length - decimalIndex - 1;
}

/**
 * Converts an amount string to the smallest unit (stroops for XLM)
 * @param amount - The amount string
 * @param decimals - Number of decimals for the token (default 7 for XLM)
 * @returns Amount in smallest unit as bigint
 */
export function amountToStroops(amount: string, decimals: number = 7): bigint {
  if (!isValidAmount(amount)) {
    throw new Error('Invalid amount');
  }

  const trimmed = amount.trim();
  const [integerPart = '0', fractionalPart = ''] = trimmed.split('.');
  const paddedFraction = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  const baseMultiplier = BigInt(10 ** decimals);
  return BigInt(integerPart) * baseMultiplier + BigInt(paddedFraction || '0');
}

/**
 * Converts an amount from smallest unit to decimal string
 * @param stroops - Amount in smallest unit
 * @param decimals - Number of decimals for the token (default 7 for XLM)
 * @returns Amount as decimal string
 */
export function stroopsToAmount(stroops: bigint, decimals: number = 7): string {
  const divisor = BigInt(Math.pow(10, decimals));
  const wholePart = stroops / divisor;
  const fractionalPart = stroops % divisor;
  
  if (fractionalPart === 0n) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.replace(/0+$/, '');
  
  return `${wholePart}.${trimmedFractional}`;
}

/**
 * Calculates the per-recipient amount for equal distribution
 * @param totalAmount - Total amount to distribute
 * @param recipientCount - Number of recipients
 * @returns Per-recipient amount as string
 */
export function calculateEqualAmount(totalAmount: string, recipientCount: number): string {
  if (!isValidAmount(totalAmount) || recipientCount <= 0) {
    return '0';
  }

  const total = Number(totalAmount.trim());
  const perRecipient = total / recipientCount;
  
  return perRecipient.toFixed(MAX_DECIMAL_PLACES).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Calculates the total amount for weighted distribution
 * @param amounts - Array of individual amounts
 * @returns Total amount as string
 */
export function calculateTotalAmount(amounts: string[]): string {
  let totalStroops = 0n;
  
  for (const amount of amounts) {
    if (isValidAmount(amount)) {
      totalStroops += amountToStroops(amount);
    }
  }
  
  return stroopsToAmount(totalStroops);
}

/**
 * Validates a list of amounts
 * @param amounts - Array of amount strings to validate
 * @returns Object with validation results
 */
export function validateAmountList(amounts: string[]): {
  validAmounts: string[];
  invalidAmounts: { amount: string; error: string; index: number }[];
  totalAmount: string;
} {
  const validAmounts: string[] = [];
  const invalidAmounts: { amount: string; error: string; index: number }[] = [];

  amounts.forEach((amount, index) => {
    const error = validateAmount(amount);
    if (error) {
      invalidAmounts.push({ amount, error, index });
    } else {
      validAmounts.push(amount);
    }
  });

  const totalAmount = calculateTotalAmount(validAmounts);

  return {
    validAmounts,
    invalidAmounts,
    totalAmount,
  };
}