import { NextResponse } from "next/server";
import { TaxReportingSDK } from "@fundable/sdk";

const sdk = new TaxReportingSDK(process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { creatorId, taxYear } = body;

    if (!creatorId || !taxYear) {
      return NextResponse.json(
        { error: "Missing required fields: creatorId and taxYear" },
        { status: 400 }
      );
    }

    const report = await sdk.getAnnualEarnings({ creatorId, taxYear: Number(taxYear) });

    return NextResponse.json({
      success: true,
      data: report,
      message: `IRS 1099-NEC data compiled successfully for tax year ${taxYear}.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
