/**
 * Fundable Stellar SDK
 *
 * TypeScript SDK for interacting with Fundable Protocol smart contracts on Stellar.
 */

export const VERSION = "0.2.0";

// Re-export generated types for Payment Stream
export * from "./generated/payment-stream/src/index.js";
export {
  Stream as PS_Stream,
  StreamStatus as PS_StreamStatus,
  StreamMetrics as PS_StreamMetrics,
  ProtocolMetrics as PS_ProtocolMetrics,
} from "./generated/payment-stream/src/index.js";

// Re-export generated types for Distributor
export {
  UserStats,
  TokenStats,
  DistributionHistory,
} from "./generated/distributor/src/index.js";

// Re-export generated types for Planter
export {
  PlanterInfo,
  ReferralInfo,
} from "./generated/planter/src/index.js";

// Export high-level clients
export * from "./PaymentStreamClient.js";
export * from "./DistributorClient.js";
export * from "./PlanterClient.js";
export * from "./CarbonCreditClient.js";
export * from "./ImpactNFTClient.js";
export * from "./nft-milestone.js";

// Export deployment module
export * from "./deployer/index.js";

// Export utility modules
export * from "./utils/batchDistribution.js";
export * from "./utils/events.js";
export * from "./utils/soroban-transaction-helper.js";
export * from "./utils/SorobanEventParser.js";
export * from "./utils/networkDetection.js";
export * from "./utils/streamHistory.js";
export * from "./utils/BalanceWatcher.js";
export * from "./utils/transactions.js";
export * from "./utils/GasEstimator.js";
export * from "./utils/rpcConnectionOptions.js";

// Export tax reporting utilities (issue #792)
export * from "./tax.js";

// Export error handling utilities
export {
  parseContractError,
  executeWithErrorHandling,
  FundableStellarError,
  CONTRACT_ERRORS,
  type ParsedContractError,
} from "./utils/errors.js";
