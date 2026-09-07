import { describe, it, expect } from "vitest";
import {
  isLockedWalletError,
  WALLET_LOCKED_ERROR_CODE,
  isWalletCancellationError,
  WALLET_REJECTED_ERROR_CODE,
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

describe("isWalletCancellationError", () => {
  it("detects user rejection error code -4", () => {
    expect(
      isWalletCancellationError({
        code: WALLET_REJECTED_ERROR_CODE,
        message: "The user rejected this request.",
      }),
    ).toBe(true);
  });

  it("detects string user rejected / declined error messages", () => {
    expect(isWalletCancellationError("User rejected")).toBe(true);
    expect(isWalletCancellationError("User declined the connection request")).toBe(true);
    expect(isWalletCancellationError("Permission denied")).toBe(true);
  });

  it("detects modal / popover closed or cancelled errors", () => {
    expect(isWalletCancellationError(new Error("User closed modal"))).toBe(true);
    expect(isWalletCancellationError(new Error("Connection request cancelled by user"))).toBe(true);
    expect(isWalletCancellationError(new Error("Popup closed"))).toBe(true);
    expect(isWalletCancellationError(new Error("Window closed"))).toBe(true);
    expect(isWalletCancellationError({ message: "Modal closed by user" })).toBe(true);
    expect(isWalletCancellationError({ error: { message: "Request aborted" } })).toBe(true);
  });

  it("detects string-coded cancellation errors", () => {
    expect(isWalletCancellationError({ code: "USER_REJECTED" })).toBe(true);
    expect(isWalletCancellationError({ code: "USER_CANCELLED" })).toBe(true);
    expect(isWalletCancellationError({ code: "CANCELED" })).toBe(true);
  });

  it("does not treat genuine network or unhandled errors as cancellation", () => {
    expect(isWalletCancellationError(new Error("Network connection failed"))).toBe(false);
    expect(isWalletCancellationError(new Error("Internal RPC error"))).toBe(false);
    expect(isWalletCancellationError(null)).toBe(false);
    expect(isWalletCancellationError(undefined)).toBe(false);
  });
});

