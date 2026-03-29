// ==================== OFFRAMP TYPES ====================
// Adapted from evm_client types for Stellar + Allbridge bridge flow

// Supported countries for offramp
export type OfframpCountry = "NG" | "GH" | "KE";
export type OfframpCurrency = "NGN" | "GHS" | "KES";

// Currency symbols
export const CURRENCY_SYMBOLS: Record<string, string> = {
    NGN: "₦",
    GHS: "₵",
    KES: "KSh ",
};

export const getCurrencySymbol = (currency: string) =>
    CURRENCY_SYMBOLS[currency] || currency + " ";

export interface CountryInfo {
    code: OfframpCountry;
    name: string;
    currency: OfframpCurrency;
    flag: string;
}

export const SUPPORTED_COUNTRIES: CountryInfo[] = [
    { code: "NG", name: "Nigeria", currency: "NGN", flag: "🇳🇬" },
    { code: "GH", name: "Ghana", currency: "GHS", flag: "🇬🇭" },
    { code: "KE", name: "Kenya", currency: "KES", flag: "🇰🇪" },
];

// Supported crypto tokens
export type OfframpToken = "USDC" | "USDT" | "XLM";

export interface TokenInfo {
    symbol: OfframpToken;
    name: string;
    decimals: number;
}

export const SUPPORTED_OFFRAMP_TOKENS: TokenInfo[] = [
    { symbol: "USDC", name: "USD Coin", decimals: 7 }, // Stellar uses 7 decimals
];

// Bank information
export interface Bank {
    code: string;
    name: string;
}

export interface BankAccount {
    bankCode: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
}

// ==================== API REQUEST/RESPONSE TYPES ====================

export interface BankListResponse {
    success: boolean;
    data?: Bank[];
    error?: string;
}

export interface VerifyBankAccountResponse {
    success: boolean;
    data?: {
        accountName: string;
        accountNumber: string;
        bankName: string;
    };
    error?: string;
}

export interface RateInfoResponse {
    success: boolean;
    data?: {
        cryptoAsset: string;
        currency: string;
        cryptoAssetInfo: { currency: string; symbol: string; rate: number };
        currencyInfo: { currency: string; symbol: string; rate: number };
        timestamp: string;
    };
    error?: string;
}

// ==================== MULTI-PROVIDER TYPES ====================

export type OfframpProviderId = "cashwyre" | "autoramp";

export interface ProviderRate {
    providerId: OfframpProviderId;
    displayName: string;
    cryptoAmount: number;
    fiatAmount: number;
    rate: number;
    fee: number;
    currency: string;
    token: string;
    network: string;
    expiresAt?: string;
}

export interface AggregatedRatesResponse {
    success: boolean;
    data?: {
        best: ProviderRate | null;
        all: ProviderRate[];
        errors: { providerId: string; error: string }[];
        timestamp: string;
    };
    error?: string;
}

export interface CreateOfframpRequest {
    providerId: OfframpProviderId;
    token: string;
    amount: number;
    country: string;
    currency: string;
    network: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
}

export interface CreateOfframpResponse {
    success: boolean;
    data?: {
        providerId: OfframpProviderId;
        reference: string;
        depositAddress: string;
        depositAmount: number;
        depositToken: string;
        depositNetwork: string;
        fiatAmount: number;
        currency: string;
        status: string;
        expiresAt?: string;
    };
    error?: string;
}

// ==================== QUOTE & STATUS TYPES ====================

export type PayoutStatus =
    | "pending"
    | "processing"
    | "confirmed"
    | "completed"
    | "failed"
    | "expired";

export interface QuoteStatusData {
    id: string;
    transactionReference: string;
    status: PayoutStatus;
    providerStatus: string | null;
    providerMessage: string | null;
    providerId: string;
    payoutCompletedAt: string | null;
}

export interface QuoteStatusResponse {
    success: boolean;
    data?: QuoteStatusData;
    error?: string;
}

// ==================== FORM & UI STATE TYPES ====================

export interface OfframpFormState {
    token: OfframpToken;
    amount: string;
    country: OfframpCountry;
    bankCode: string;
    accountNumber: string;
    accountName: string;
}

// ==================== BRIDGE-SPECIFIC TYPES ====================

export interface BridgeFeeBreakdown {
    /** Amount user sends from Stellar wallet */
    sendAmount: string;
    /** Allbridge bridge fee */
    bridgeFee: string;
    /** Amount arriving on Polygon at Cashwyre deposit address */
    receivedOnPolygon: string;
    /** Cashwyre's fee or rate spread */
    cashwyreFee: string;
    /** Final fiat payout amount */
    fiatPayout: string;
    /** Currency code (e.g., NGN) */
    currency: string;
    /** USDC→fiat exchange rate */
    exchangeRate: string;
    /** Estimated time in minutes for bridge + payout */
    estimatedTime: number;
}

export type OfframpStep =
    | "form"       // Filling in amount + bank details
    | "quote"      // Viewing quote + bridge fee breakdown
    | "signing"    // Wallet signature pending
    | "bridging"   // Allbridge transfer in progress
    | "processing" // Cashwyre processing fiat payout
    | "completed"  // NGN sent to user's bank
    | "failed";    // Error occurred
