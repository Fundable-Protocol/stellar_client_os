/**
 * Fundable Stellar SDK
 *
 * TypeScript SDK for interacting with Fundable Protocol smart contracts on Stellar.
 */

export const VERSION = "0.1.0";

// Re-export generated types for Payment Stream
export * from "./generated/payment-stream/src/index";
export {
  Stream as PS_Stream,
  StreamStatus as PS_StreamStatus,
  StreamMetrics as PS_StreamMetrics,
  ProtocolMetrics as PS_ProtocolMetrics,
} from "./generated/payment-stream/src/index";

// Re-export generated types for Distributor
export {
  UserStats,
  TokenStats,
  DistributionHistory,
} from "./generated/distributor/src/index";

// Export high-level clients
export * from "./PaymentStreamClient";
export * from "./DistributorClient";

// Export deployment module
export * from "./deployer";

// Export utility modules
export * from "./utils/batchDistribution";
export * from "./utils/events";
export * from "./utils/networkDetection";
export * from "./utils/streamHistory";
export * from "./utils/BalanceWatcher";
export * from "./utils/transactions";

// Export error handling utilities
export {
  parseContractError,
  executeWithErrorHandling,
  FundableStellarError,
  CONTRACT_ERRORS,
  type ParsedContractError,
} from "./utils/errors";
