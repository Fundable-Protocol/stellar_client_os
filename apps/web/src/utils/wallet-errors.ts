/**
 * Error code thrown by @creit.tech/stellar-wallets-kit when getAddress
 * returns an empty address — the typical Freighter/extension response when
 * the wallet is locked (or access has not been granted yet after lock).
 *
 * See FreighterModule.getAddress: `{ code: -3, message: "Getting the address..." }`.
 */
export const WALLET_LOCKED_ERROR_CODE = -3;

type WalletErrorLike = {
  code?: unknown;
  message?: unknown;
  error?: { code?: unknown; message?: unknown };
};

/**
 * Returns true when a wallet SDK / extension error indicates the extension
 * wallet is locked (or otherwise unable to return an address because it is locked).
 */
export function isLockedWalletError(error: unknown): boolean {
  if (!error) return false;

  const err = error as WalletErrorLike;
  const code = err.code ?? err.error?.code;
  const message = String(err.message ?? err.error?.message ?? "").toLowerCase();

  if (
    message.includes("locked") ||
    message.includes("unlock") ||
    message.includes("wallet is locked")
  ) {
    return true;
  }

  // Kit surfaces empty-address (locked) as code -3 with an address-related message.
  if (code === WALLET_LOCKED_ERROR_CODE && message.includes("address")) {
    return true;
  }

  if (typeof error === "string") {
    const lower = error.toLowerCase();
    return lower.includes("locked") || lower.includes("unlock");
  }

  return false;
}

/**
 * Error code returned/thrown when a user explicitly rejects or cancels a
 * wallet connection or signing request (e.g. Freighter rejection code -4).
 */
export const WALLET_REJECTED_ERROR_CODE = -4;

/**
 * Returns true when an error indicates that the user cancelled or closed the
 * wallet connection modal, popover, or extension prompt.
 */
export function isWalletCancellationError(error: unknown): boolean {
  if (!error) return false;

  const err = error as WalletErrorLike;
  const code = err.code ?? err.error?.code;
  const message = String(err.message ?? err.error?.message ?? "").toLowerCase();

  // Known rejection / cancellation error codes
  if (
    code === WALLET_REJECTED_ERROR_CODE ||
    code === -4 ||
    code === "USER_REJECTED" ||
    code === "USER_CANCELLED" ||
    code === "USER_CANCELED" ||
    code === "CANCELLED" ||
    code === "CANCELED"
  ) {
    return true;
  }

  if (
    message.includes("user rejected") ||
    message.includes("user declined") ||
    message.includes("declined") ||
    message.includes("permission denied") ||
    message.includes("user cancelled") ||
    message.includes("user canceled") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("cancellation") ||
    message.includes("closed") ||
    message.includes("dismissed") ||
    message.includes("aborted") ||
    message.includes("rejected")
  ) {
    return true;
  }

  if (typeof error === "string") {
    const lower = error.toLowerCase();
    return (
      lower.includes("user rejected") ||
      lower.includes("user declined") ||
      lower.includes("declined") ||
      lower.includes("permission denied") ||
      lower.includes("user cancelled") ||
      lower.includes("user canceled") ||
      lower.includes("cancelled") ||
      lower.includes("canceled") ||
      lower.includes("cancellation") ||
      lower.includes("closed") ||
      lower.includes("dismissed") ||
      lower.includes("aborted") ||
      lower.includes("rejected")
    );
  }

  return false;
}

