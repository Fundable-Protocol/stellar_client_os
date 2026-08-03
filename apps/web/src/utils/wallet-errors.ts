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
