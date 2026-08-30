/**
 * Stellar Service Layer
 *
 * This module provides the service layer for interacting with Stellar network
 * and Fundable Protocol smart contracts.
 *
 * @example
 * ```typescript
 * import { StellarService, createTestnetService } from '@/services';
 *
 * // Create service for testnet
 * const service = createTestnetService({
 *   paymentStream: 'CONTRACT_ADDRESS',
 *   distributor: 'CONTRACT_ADDRESS',
 * });
 *
 * // Fetch user's streams
 * const streams = await service.getStreams(userAddress);
 *
 * // Create a new stream
 * const result = await service.createStream({
 *   recipient: 'G...',
 *   token: 'C...',
 *   totalAmount: 1000n,
 *   startTime: BigInt(Math.floor(Date.now() / 1000)),
 *   endTime: BigInt(Math.floor(Date.now() / 1000) + 86400), // 1 day
 * }, signerKeypair);
 * ```
 */

export {
  StellarService,
  createTestnetService,
  createMainnetService,
} from './stellar.service';

export type {
  Stream,
  StreamStatus,
  CreateStreamParams,
  DistributeParams,
  DistributeEqualParams,
  TransactionResult,
  AccountInfo,
  AccountBalance,
  NetworkConfig,
  ContractAddresses,
  StellarServiceConfig,
} from './types';

export {
  StellarError,
  NetworkError,
  TransactionError,
  TransactionTimeoutError,
  ContractError,
  SimulationError,
  AccountNotFoundError,
  StreamNotFoundError,
  InsufficientFundsError,
  ValidationError,
  parseError,
} from './errors';

export { socialService, SocialService } from './social.service';

export {
  CampaignRecommendationService,
  calculateCampaignSimilarity,
  getCampaignRecommendationService,
} from './campaign-recommendation.service';
export type {
  CampaignRecommendation,
  CampaignRecommendationOptions,
  CampaignRecommendationResponse,
  CampaignRecommendationServiceOptions,
  CampaignSimilarity,
} from './campaign-recommendation.service';
