import { beforeEach, describe, expect, it, vi } from "vitest";
import { Address, Keypair } from "@stellar/stellar-sdk";
import { PlanterClient } from "../PlanterClient.js";

const { mockContractClient, mockExecuteWithErrorHandling } = vi.hoisted(() => ({
  mockContractClient: {
    initialize: vi.fn(),
    register_planter: vi.fn(),
    complete_job: vi.fn(),
    claim_referral_reward: vi.fn(),
    get_planter: vi.fn(),
    get_referral_info: vi.fn(),
    get_reward_amount: vi.fn(),
    set_reward_amount: vi.fn(),
  },
  mockExecuteWithErrorHandling: vi.fn((tx: unknown) => tx),
}));

vi.mock("../generated/planter/src/index.js", () => ({
  Client: vi.fn().mockImplementation(() => mockContractClient),
}));

vi.mock("../utils/errors.js", () => ({
  executeWithErrorHandling: mockExecuteWithErrorHandling,
}));

function mockTx(result?: unknown) {
  return { result, signAndSend: vi.fn() };
}

describe("PlanterClient", () => {
  const admin = Keypair.random().publicKey();
  const rewardToken = Keypair.random().publicKey();
  const planter = Keypair.random().publicKey();
  const referrer = Keypair.random().publicKey();
  let client: PlanterClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new PlanterClient({
      contractId: Keypair.random().publicKey(),
      networkPassphrase: "Test SDF Network ; September 2015",
      rpcUrl: "https://soroban-testnet.stellar.org",
    });
  });

  it("initializes using generated contract argument names and normalized addresses", async () => {
    const tx = mockTx();
    mockContractClient.initialize.mockResolvedValue(tx);

    await client.initialize({
      admin: new Address(admin),
      rewardToken,
      rewardAmount: 20_000_000n,
    });

    expect(mockContractClient.initialize).toHaveBeenCalledWith({
      admin,
      reward_token: rewardToken,
      reward_amount: 20_000_000n,
    });
    expect(mockExecuteWithErrorHandling).toHaveBeenCalledWith(tx, "initialize");
  });

  it("registers a planter with an optional referrer", async () => {
    mockContractClient.register_planter.mockResolvedValue(mockTx());

    await client.registerPlanter({ planter, referrer });

    expect(mockContractClient.register_planter).toHaveBeenCalledWith({
      planter,
      referrer,
    });
  });

  it("registers a planter without a referrer", async () => {
    mockContractClient.register_planter.mockResolvedValue(mockTx());

    await client.registerPlanter({ planter });

    expect(mockContractClient.register_planter).toHaveBeenCalledWith({
      planter,
      referrer: undefined,
    });
  });

  it("records a completed job", async () => {
    mockContractClient.complete_job.mockResolvedValue(mockTx());

    await client.completeJob({ planter: new Address(planter) });

    expect(mockContractClient.complete_job).toHaveBeenCalledWith({ planter });
  });

  it("claims a referral reward", async () => {
    mockContractClient.claim_referral_reward.mockResolvedValue(mockTx());

    await client.claimReferralReward({
      referrer,
      referredPlanter: planter,
    });

    expect(mockContractClient.claim_referral_reward).toHaveBeenCalledWith({
      referrer,
      referred_planter: planter,
    });
  });

  it("returns the assembled planter query transaction", async () => {
    const tx = mockTx({ address: planter });
    mockContractClient.get_planter.mockResolvedValue(tx);

    await expect(client.getPlanter({ planter })).resolves.toBe(tx);
    expect(mockContractClient.get_planter).toHaveBeenCalledWith({ planter });
  });

  it("returns the assembled referral query transaction", async () => {
    const tx = mockTx({ referral_count: 2n });
    mockContractClient.get_referral_info.mockResolvedValue(tx);

    await expect(client.getReferralInfo({ referrer })).resolves.toBe(tx);
    expect(mockContractClient.get_referral_info).toHaveBeenCalledWith({ referrer });
  });

  it("returns the assembled reward amount transaction", async () => {
    const tx = mockTx(20_000_000n);
    mockContractClient.get_reward_amount.mockResolvedValue(tx);

    await expect(client.getRewardAmount()).resolves.toBe(tx);
    expect(mockContractClient.get_reward_amount).toHaveBeenCalledWith();
  });

  it("updates the reward amount", async () => {
    const tx = mockTx();
    mockContractClient.set_reward_amount.mockResolvedValue(tx);

    await client.setRewardAmount({ newAmount: 30_000_000n });

    expect(mockContractClient.set_reward_amount).toHaveBeenCalledWith({
      new_amount: 30_000_000n,
    });
    expect(mockExecuteWithErrorHandling).toHaveBeenCalledWith(
      tx,
      "set_reward_amount",
    );
  });
});
