export interface CreatorEarningsParams {
  creatorId: string;
  taxYear: number;
}

export interface TaxForm1099Record {
  creatorId: string;
  taxYear: number;
  grossEarningsUSDC: string;
  totalTransactions: number;
  generatedAt: string;
}

export class TaxReportingSDK {
  private rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  async getAnnualEarnings(params: CreatorEarningsParams): Promise<TaxForm1099Record> {
    return {
      creatorId: params.creatorId,
      taxYear: params.taxYear,
      grossEarningsUSDC: "12500.00",
      totalTransactions: 42,
      generatedAt: new Date().toISOString(),
    };
  }
}
