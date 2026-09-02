import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlanterClient } from "../PlanterClient";
import { Address } from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Mock the generated planter contract client
// ---------------------------------------------------------------------------
const mockTx = (result: unknown = undefined) => ({
  result,
  signAndSend: vi.fn(),
});

const mockTxNone = () => ({ result: undefined, signAndSend: vi.fn() });

const mockContractClient = {
  initialize: vi.fn(),
  register_planter: vi.fn(),
  complete_job: vi.fn(),
  claim_referral_reward: vi.fn(),
  get_planter: vi.fn(),
  get_referral_info: vi.fn(),
  get_reward_amount: vi.fn(),
  set_reward_amount: vi.fn(),
};

vi.mock("../generated/planter/src/index", () => ({
  Client: vi.fn().mockImplementation(() => mockContractClient),
}));

vi.mock("../utils/errors", () => ({
  executeWithErrorHandling: vi.fn((tx: any, method: any) => tx),
}));
