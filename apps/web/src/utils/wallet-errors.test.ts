import { describe, it, expect } from "vitest";
import {
  isLockedWalletError,
  WALLET_LOCKED_ERROR_CODE,
} from "./wallet-errors";

describe("isLockedWalletError", () => {
  it("detects stellar-wallets-kit locked/empty-address error code -3", () => {
    expect(
      isLockedWalletError({
        code: WALLET_LOCKED_ERROR_CODE,
        message: "Getting the address is not allowed, please request access first.",
      }),
    ).toBe(true);
  });

  it("detects nested FreighterApiError-style payload with locked message", () => {
    expect(
      isLockedWalletError({
        error: { code: -1, message: "Wallet is locked" },
      }),
    ).toBe(true);
  });

  it("detects unlock guidance message from provider", () => {
    expect(
      isLockedWalletError(
        new Error(
          "No address returned from wallet. Please ensure your wallet is unlocked and try again.",
        ),
      ),
    ).toBe(true);
  });

  it("detects plain string locked errors", () => {
    expect(isLockedWalletError("extension wallet is locked")).toBe(true);
  });

  it("does not treat unrelated errors as locked", () => {
    expect(
      isLockedWalletError({
        code: -4,
        message: "The user rejected this request.",
      }),
    ).toBe(false);
    expect(
      isLockedWalletError({
        code: WALLET_LOCKED_ERROR_CODE,
        message: "Method not supported",
      }),
    ).toBe(false);
    expect(isLockedWalletError(null)).toBe(false);
    expect(isLockedWalletError(undefined)).toBe(false);
  });
});
