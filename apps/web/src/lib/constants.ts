import { env } from "./env";

export const PAYMENT_STREAM_CONTRACT_ID = env.NEXT_PUBLIC_PAYMENT_STREAM_CONTRACT_ID;
export const DISTRIBUTOR_CONTRACT_ID = env.NEXT_PUBLIC_DISTRIBUTOR_CONTRACT_ID;
export const STELLAR_RPC_URL = env.NEXT_PUBLIC_STELLAR_RPC_URL;
export const STELLAR_HORIZON_URL = env.NEXT_PUBLIC_STELLAR_HORIZON_URL;
export const NETWORK_PASSPHRASE = env.NEXT_PUBLIC_NETWORK_PASSPHRASE;
export const STELLAR_NETWORK = env.NEXT_PUBLIC_STELLAR_NETWORK;

// Distribution
export const distributionType = ["equal", "weighted"] as const;
export const supportedNetwork = ["mainnet", "testnet"] as const;
export const distributionStatus = ["completed", "failed", "pending"] as const;
export const distributionState = [
    "process-started",
    "initiate-distribution",
    "process-completed",
    "request-confirmed",
    "request-confirmation",
] as const;

// Payment Stream
export const paymentStreamStatus = ["active", "paused", "canceled", "completed"] as const;
export const validPageLimits = [10, 20, 50, 100] as const;

// Stellar Explorer
export const STELLAR_EXPERT_URL =
  STELLAR_NETWORK === "mainnet"
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";
