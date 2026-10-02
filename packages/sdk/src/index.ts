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
export {
  DistributorClient,
  type AddressParam as DistributorAddressParam,
} from "./DistributorClient.js";
export {
  PlanterClient,
  type AddressParam as PlanterAddressParam,
} from "./PlanterClient.js";
export {
  CampaignFundingClient,
  CampaignFundingErrors,
  type AddressParam as CampaignFundingAddressParam,
  type Campaign,
  type CampaignStatus,
} from "./CampaignFundingClient.js";
export * from "./CarbonCreditClient.js";
export * from "./ImpactNFTClient.js";
export * from "./nft-milestone.js";
export * from "./SpeciesProofClient.js";
export * from "./utils/checked-math.js";
export * from "./CampaignDiversityClient.js";

// Export deployment module, disambiguating names also exported by generated bindings.
export { ContractDeployer } from "./deployer/ContractDeployer.js";
export * from "./deployer/errors.js";
export {
  type ContractDeployResult,
  type Deployer,
  type DeployerAccount,
  type DeployerConfig,
  type FeeEstimate,
  type Signer as DeployerSigner,
  type SigningCallback as DeployerSigningCallback,
  type StellarNetwork,
  type WasmUploadResult,
} from "./deployer/types.js";

// Export utility modules
export * from "./utils/batchDistribution.js";
export * from "./utils/events.js";
export * from "./utils/soroban-transaction-helper.js";
export * from "./utils/SorobanEventParser.js";
export * from "./utils/networkDetection.js";
export * from "./utils/streamHistory.js";
export * from "./utils/BalanceWatcher.js";
export * from "./utils/transactions.js";
export {
  GasEstimator,
  estimateSorobanGas,
  type GasEstimate,
  type GasEstimatorOptions,
  type GasEstimatorRpc,
  type GasPriceRecommendation,
  type GasResourceLimits,
  type CongestionLevel as GasEstimatorCongestionLevel,
} from "./utils/GasEstimator.js";
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
