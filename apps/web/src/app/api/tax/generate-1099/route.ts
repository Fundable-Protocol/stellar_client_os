import { loadCreatorTaxYearEarnings } from "@/services/tax.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const creatorId = typeof body?.creatorId === "string" ? body.creatorId.trim() : "";
    const taxYear = Number(body?.taxYear);

    if (!creatorId || !Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return Response.json(
        { success: false, error: "Missing required fields: creatorId and a valid taxYear" },
        { status: 400 },
      );
    }

    const { grossEarningsUSDC, totalTransactions, transactions } =
      await loadCreatorTaxYearEarnings(creatorId, taxYear);

    return Response.json({
      success: true,
      data: {
        creatorId,
        taxYear,
        grossEarningsUSDC,
        totalTransactions,
        transactions,
        generatedAt: new Date().toISOString(),
      },
      message: `IRS 1099-NEC data compiled successfully for tax year ${taxYear}.`,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}