// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv, env, PAYMENT_STREAM_CONTRACT_ID, DISTRIBUTOR_CONTRACT_ID } from "../env";

describe("Environment Variable Validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should throw error when required contract IDs are missing", () => {
    delete process.env.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID;
    expect(() => validateEnv()).toThrow(/Environment variable validation failed/);
  });

  it("should throw error when contract IDs don't start with C", () => {
    process.env.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID = "INVALID123";
    process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID = "CVALID123";
    expect(() => validateEnv()).toThrow(/Contract ID must start with 'C'/);
  });

  it("should throw error when network is invalid", () => {
    process.env.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID = "CVALID123";
    process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID = "CVALID456";
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "invalid";
    expect(() => validateEnv()).toThrow(/Network must be either 'testnet' or 'mainnet'/);
  });

  it("should accept valid environment variables", () => {
    process.env.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID = "CVALID123";
    process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID = "CVALID456";
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    expect(() => validateEnv()).not.toThrow();
  });

  it("should use default values for optional variables", () => {
    process.env.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID = "CVALID123";
    process.env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID = "CVALID456";
    expect(() => validateEnv()).not.toThrow();
  });

  it("should export contract IDs from the env module", () => {
    expect(PAYMENT_STREAM_CONTRACT_ID).toBe(env.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID);
    expect(DISTRIBUTOR_CONTRACT_ID).toBe(env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID);
  });
});
