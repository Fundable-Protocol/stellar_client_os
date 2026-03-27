import type {
  AggregatedRatesResponse,
  BankListResponse,
  CreateOfframpRequest,
  CreateOfframpResponse,
  OfframpCountry,
  ProviderRate,
  QuoteStatusResponse,
  VerifyBankAccountResponse,
} from "@/types/offramp";
import type { BridgeQuote } from "@/services/allbridge.service";
import { createAbortError } from "@/utils/retry";

const DEFAULT_DELAYS = {
  sync: 250,
  banks: 600,
  verify: 800,
  rates: 700,
  create: 1000,
  saveQuote: 400,
  updateTx: 400,
  status: 1000,
  signing: 900,
  bridging: 1600,
  payoutPending: 1200,
  payoutProcessing: 2200,
};

type DelayKey = keyof typeof DEFAULT_DELAYS;

type DelayOverrides = Partial<Record<DelayKey, number>>;

const parseDelayOverrides = (): DelayOverrides => {
  const raw = process.env.NEXT_PUBLIC_OFFRAMP_MOCK_DELAYS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as DelayOverrides;
    return parsed || {};
  } catch {
    return {};
  }
};

const delayOverrides = parseDelayOverrides();

export const isOfframpMockEnabled =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_OFFRAMP_MOCK === "true";

const mockFailStep = process.env.NEXT_PUBLIC_OFFRAMP_MOCK_FAIL_STEP || "";
const mockFailRate = Number.parseFloat(
  process.env.NEXT_PUBLIC_OFFRAMP_MOCK_FAIL_RATE || "0",
);

const shouldFail = (step: string) => {
  if (mockFailStep && mockFailStep === step) return true;
  if (Number.isFinite(mockFailRate) && mockFailRate > 0) {
    return Math.random() < mockFailRate;
  }
  return false;
};

export const getMockDelay = (key: DelayKey) =>
  delayOverrides[key] ?? DEFAULT_DELAYS[key];

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });

const currencyRates: Record<OfframpCountry, number> = {
  NG: 1550,
  GH: 12.8,
  KE: 135,
};

const mockBanks: Record<OfframpCountry, { code: string; name: string }[]> = {
  NG: [
    { code: "044", name: "Access Bank" },
    { code: "058", name: "GTBank" },
    { code: "011", name: "First Bank" },
  ],
  GH: [
    { code: "GCB", name: "GCB Bank" },
    { code: "ECO", name: "Ecobank Ghana" },
  ],
  KE: [
    { code: "KCB", name: "KCB Bank" },
    { code: "EQ", name: "Equity Bank" },
  ],
};

const buildProviderRates = (
  token: string,
  amount: number,
  country: OfframpCountry,
  currency: string,
): ProviderRate[] => {
  const baseRate = currencyRates[country];
  const jitter = 1 + (Math.random() * 0.02 - 0.01);
  const rate = baseRate * jitter;
  const fee = Math.max(0.5, amount * 0.004) * rate;
  const fiatAmount = Math.max(0, amount * rate - fee);

  const now = Date.now();
  const expiry = new Date(now + 5 * 60 * 1000).toISOString();

  return [
    {
      providerId: "cashwyre",
      displayName: "Cashwyre",
      cryptoAmount: Number(amount.toFixed(2)),
      fiatAmount: Number(fiatAmount.toFixed(2)),
      rate: Number(rate.toFixed(2)),
      fee: Number(fee.toFixed(2)),
      currency,
      token,
      network: "polygon",
      expiresAt: expiry,
    },
    {
      providerId: "autoramp",
      displayName: "AutoRamp",
      cryptoAmount: Number(amount.toFixed(2)),
      fiatAmount: Number((fiatAmount * 0.995).toFixed(2)),
      rate: Number((rate * 0.995).toFixed(2)),
      fee: Number((fee * 0.9).toFixed(2)),
      currency,
      token,
      network: "polygon",
      expiresAt: expiry,
    },
  ];
};

const mockQuotes = new Map<
  string,
  {
    createdAt: number;
    reference: string;
    providerId: string;
    currency: string;
    shouldFail: boolean;
  }
>();

const createReference = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `mock-${Math.random().toString(36).slice(2, 10)}`;
};

export const getMockBridgeQuote = (receiveAmount: string): BridgeQuote => {
  const receiveNum = Number.parseFloat(receiveAmount || "0");
  const sendAmount = (receiveNum * 1.015).toFixed(6);
  return {
    sendAmount,
    receiveAmount,
    bridgeFee: (Number(sendAmount) - receiveNum).toFixed(6),
    estimatedTimeMinutes: 6,
  };
};

export const createMockTxHash = () =>
  `mock-tx-${Math.random().toString(36).slice(2, 12)}`;

export const mockOfframpService = {
  async syncWallet(
    _walletId?: string,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; message: string }> {
    await sleep(getMockDelay("sync"), signal);
    return { success: true, message: "Wallet synced (mock)" };
  },

  async getAggregatedRates(
    params: {
      token: string;
      amount: number;
      country: string;
      currency: string;
    },
    signal?: AbortSignal,
  ): Promise<AggregatedRatesResponse> {
    await sleep(getMockDelay("rates"), signal);
    if (shouldFail("rates")) {
      return { success: false, error: "Mock rate provider error" };
    }

    const rates = buildProviderRates(
      params.token,
      params.amount,
      params.country as OfframpCountry,
      params.currency,
    );

    return {
      success: true,
      data: {
        best: rates[0] || null,
        all: rates,
        errors: [],
        timestamp: new Date().toISOString(),
      },
    };
  },

  async createOfframp(
    request: Omit<CreateOfframpRequest, "network">,
    _walletId?: string,
    signal?: AbortSignal,
  ): Promise<CreateOfframpResponse> {
    await sleep(getMockDelay("create"), signal);

    if (shouldFail("create")) {
      return { success: false, error: "Mock offramp creation failed" };
    }

    const reference = createReference();
    const depositAmount = Number(request.amount.toFixed(2));
    const rate = currencyRates[request.country as OfframpCountry] || 1;
    const fiatAmount = Number((depositAmount * rate * 0.985).toFixed(2));

    mockQuotes.set(reference, {
      createdAt: Date.now(),
      reference,
      providerId: request.providerId,
      currency: request.currency,
      shouldFail: shouldFail("payout"),
    });

    return {
      success: true,
      data: {
        providerId: request.providerId,
        reference,
        depositAddress: "mock-polygon-deposit-address",
        depositAmount,
        depositToken: request.token,
        depositNetwork: "polygon",
        fiatAmount,
        currency: request.currency,
        status: "pending",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      },
    };
  },

  async getBankList(
    country: OfframpCountry,
    _walletId?: string,
    signal?: AbortSignal,
  ): Promise<BankListResponse> {
    await sleep(getMockDelay("banks"), signal);
    if (shouldFail("banks")) {
      return { success: false, error: "Mock bank list unavailable" };
    }
    return { success: true, data: mockBanks[country] || [] };
  },

  async verifyBankAccount(
    bankCode: string,
    accountNumber: string,
    country: string,
    _walletId?: string,
    signal?: AbortSignal,
  ): Promise<VerifyBankAccountResponse> {
    await sleep(getMockDelay("verify"), signal);

    if (shouldFail("verify")) {
      return { success: false, error: "Mock verification failed" };
    }

    return {
      success: true,
      data: {
        accountName: "Mock User",
        accountNumber,
        bankName:
          mockBanks[country as OfframpCountry]?.find((b) => b.code === bankCode)
            ?.name || "Mock Bank",
      },
    };
  },

  async saveQuote(
    _params?: unknown,
    _walletId?: string,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    await sleep(getMockDelay("saveQuote"), signal);
    return { success: true, data: { saved: true } };
  },

  async updateQuoteTxHash(
    _transactionReference?: string,
    _txHash?: string,
    _walletId?: string,
    signal?: AbortSignal,
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    await sleep(getMockDelay("updateTx"), signal);
    return { success: true, data: { updated: true } };
  },

  async getQuoteStatus(
    transactionReference: string,
    _walletId?: string,
    signal?: AbortSignal,
  ): Promise<QuoteStatusResponse> {
    await sleep(getMockDelay("status"), signal);

    const record = mockQuotes.get(transactionReference);
    if (!record) {
      return { success: false, error: "Mock quote not found" };
    }

    const elapsed = Date.now() - record.createdAt;
    const pendingMs = getMockDelay("payoutPending");
    const processingMs = getMockDelay("payoutProcessing");

    let status: "pending" | "processing" | "completed" | "failed" = "pending";

    if (elapsed > pendingMs + processingMs) {
      status = record.shouldFail ? "failed" : "completed";
    } else if (elapsed > pendingMs) {
      status = "processing";
    }

    return {
      success: true,
      data: {
        id: transactionReference,
        transactionReference,
        status,
        providerStatus: status,
        providerMessage:
          status === "processing"
            ? "Mock payout is processing"
            : status === "completed"
              ? "Mock payout completed"
              : status === "failed"
                ? "Mock payout failed"
                : "Mock payout pending",
        providerId: record.providerId,
        payoutCompletedAt: status === "completed" ? new Date().toISOString() : null,
      },
    };
  },
};
