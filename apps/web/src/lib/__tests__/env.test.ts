import { describe, expect, it } from "vitest";
import {
  EnvValidationError,
  getEnvValidationResult,
  validateEnv,
} from "../env-validation";

const VALID_CONTRACT_ID = `C${"A".repeat(55)}`;

function createEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID: VALID_CONTRACT_ID,
    NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID: VALID_CONTRACT_ID,
    NEXT_PUBLIC_STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
    NEXT_PUBLIC_STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
    NEXT_PUBLIC_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
    NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    ...overrides,
  };
}

describe("environment validation", () => {
  it("throws a clear error when a required contract ID is missing", () => {
    expect(() =>
      validateEnv(
        createEnv({
          NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID: undefined,
        })
      )
    ).toThrowError(EnvValidationError);
  });

  it("reports invalid contract ID format", () => {
    const result = getEnvValidationResult(
      createEnv({
        NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID: "INVALID123",
      })
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toContainEqual({
      key: "NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID",
      message: "Must be a valid Stellar contract ID: 56 characters, starting with C",
    });
  });

  it("requires both Stellar RPC and Horizon URLs", () => {
    const result = getEnvValidationResult(
      createEnv({
        NEXT_PUBLIC_STELLAR_RPC_URL: undefined,
        NEXT_PUBLIC_STELLAR_HORIZON_URL: "",
      })
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        {
          key: "NEXT_PUBLIC_STELLAR_RPC_URL",
          message: "NEXT_PUBLIC_STELLAR_RPC_URL is required",
        },
        {
          key: "NEXT_PUBLIC_STELLAR_HORIZON_URL",
          message: "NEXT_PUBLIC_STELLAR_HORIZON_URL is required",
        },
      ])
    );
  });

  it("accepts a valid environment configuration", () => {
    expect(validateEnv(createEnv())).toMatchObject({
      NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID: VALID_CONTRACT_ID,
      NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID: VALID_CONTRACT_ID,
      NEXT_PUBLIC_STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
      NEXT_PUBLIC_STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
      NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    });
  });
});
