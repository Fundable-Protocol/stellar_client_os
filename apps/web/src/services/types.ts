/**
 * Type definitions for Stellar Service
 */

export type StreamStatus = 'Active' | 'Paused' | 'Canceled' | 'Completed';

/**
 * Stream data structure matching the contract's Stream type
 */
export interface Stream {
  id: bigint;
  sender: string;
  recipient: string;
  token: string;
  totalAmount: bigint;
  withdrawnAmount: bigint;
  startTime: bigint;
  endTime: bigint;
  status: StreamStatus;
}

/**
 * Parameters for creating a new payment stream
 */
export interface CreateStreamParams {
  /** Address of the stream recipient */
  recipient: string;
  /** Token contract address */
  token: string;
  /** Total amount to stream (in token's smallest unit) */
  totalAmount: bigint;
  /** Unix timestamp when streaming starts */
  startTime: bigint;
  /** Unix timestamp when streaming ends */
  endTime: bigint;
}

/**
 * Parameters for distributing tokens
 */
export interface DistributeParams {
  /** List of recipient addresses */
  recipients: string[];
  /** Amount for each recipient (for weighted distribution) */
  amounts: bigint[];
  /** Token contract address */
  token: string;
}

/**
 * Parameters for equal distribution
 */
export interface DistributeEqualParams {
  /** List of recipient addresses */
  recipients: string[];
  /** Total amount to distribute equally */
  totalAmount: bigint;
  /** Token contract address */
  token: string;
}

/**
 * Distribution history record matching the contract's DistributionHistory
 */
export interface DistributionHistory {
  sender: string;
  token: string;
  amount: bigint;
  recipients_count: number;
  timestamp: bigint;
  transaction_hash?: string;
}

/**
 * Unified history record for both streams and distributions
 */
export interface HistoryRecord {
  id: string;
  type: 'Stream' | 'Distribution';
  date: string;
  amount: bigint;
  token: string;
  recipients: number;
  status: string;
  transactionHash?: string;
}

/**
 * Transaction result with hash and status
 */
export interface TransactionResult<T = unknown> {
  /** Transaction hash */
  hash: string;
  /** Whether the transaction was successful */
  success: boolean;
  /** Result value from contract invocation */
  result?: T;
  /** Ledger number where transaction was included */
  ledger?: number;
}

/**
 * Account information from Horizon
 */
export interface AccountInfo {
  /** Account public key */
  accountId: string;
  /** Current sequence number */
  sequence: string;
  /** Account balances */
  balances: AccountBalance[];
}

/**
 * Account balance information
 */
export interface AccountBalance {
  /** Balance amount */
  balance: string;
  /** Asset type: native, credit_alphianum4, credit_alphanum12 */
  assetType: string;
  /** Asset code (for non-native assets) */
  assetCode?: string;
  /** Asset issuer (for non-native assets) */
  assetIssuer?: string;
}

/**
 * Network configuration
 */
export interface NetworkConfig {
  /** Network passphrase (e.g., 'Test SDF Network ; September 2015') */
  networkPassphrase: string;
  /** Soroban RPC URL */
  rpcUrl: string;
  /** Horizon API URL */
  horizonUrl: string;
}

/**
 * Contract addresses configuration
 */
export interface ContractAddresses {
  /** Payment stream contract address */
  paymentStream: string;
  /** Distributor contract address */
  distributor: string;
}

/**
 * Service configuration
 */
export interface StellarServiceConfig {
  /** Network configuration */
  network: Network Config;
  /** Contract addresses */
  contracts: ContractAddresses;
  /** Default transaction timeout in seconds */
  defaultTimeout?: number;
  /** Maximum retry attempts for failed transactions */
  maxRetries?: number;
}

/**
 * Campaign success story types
 */
export interface CampaignSuccessStory {
  /** Unique identifier for the campaign */
  campaignId: string;
  /** Campaign title */
  title: string;
  /** Brief summary of the campaign and its success */
  summary: string;
  /** Date when the campaign was fully funded */
  fundedAt: string;
  /** Date when the campaign successfully shipped its rewards */
  shippedAt: string;
  /** Total amount raised in the token's smallest unit */
  raisedAmount: bigint;
  /** Number of backers */
  backersCount: number;
  /** Creator information */
  creator: CreatorProfile;
  /** Success story details including interview and testimonials */
  successStory?: SuccessStory;
}

/**
 * Creator profile information
 */
export interface CreatorProfile {
  /** Creator's display name */
  name: string;
  /** Creator's address */
  address: string;
}

/**
 * Success story containing creator interview and backer testimonials
 */
export interface SuccessStory {
  /** Interview with the creator */
  creatorInterview: CreatorInterview;
  /** Testimonials from backers */
  backerTestimonials: BackerTestimonial[];
  /** Highlighted achievements */
  highlights: string[];
}

/**
 * Interview with a campaign creator
 */
export interface CreatorInterview {
  /** Key quote from the interview */
  quote: string;
  /** Optional video URL */
  videoUrl?: string;
  /** Optional transcript */
  transcript?: string;
  /** Interviewer name */
  interviewer?: string;
  /** Interview date */
  date: string;
}

/**
 * Testimonial from a backer
 */
export interface BackerTestimonial {
  /** Backer's name */
  backerName: string;
  /** Optional backer address */
  backerAddress?: string;
  /** Optional rating (e.g., 1-5) */
  rating?: number;
  /** Testimonial comment */
  comment: string;
  /** Testimonial date */
  date: string;
}

/**
 * Campaign description language detection and translation
 */

/**
 * Detected language information for a campaign description
 */
export interface LanguageDetectionResult {
  /** Detected language code (e.g., 'en', 'es') */
  language: string;
  /** Confidence score between 0 and 1 */
  confidence: number;
}

/**
 * A translated version of a campaign description
 */
export interface CampaignTranslation {
  /** Language code of the translation */
  language: string;
  /** Translated text */
  text: string;
  /** Whether this translation was automatically generated */
  autoTranslated: boolean;
}

/**
 * Campaign description with original text and auto-generated translations
 */
export interface CampaignDescription {
  /** Original text of the description */
  originalText: string;
  /** Original language code detected for the description */
  originalLanguage: string;
  /** Translations for other languages */
  translations: CampaignTranslation[];
  /** Language detection result with confidence */
  detection?: LanguageDetectionResult;
}