import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const planter = searchParams.get("planter");
  const year = searchParams.get("year");

  if (!planter || !year) {
    return NextResponse.json({ error: "Missing planter or year parameters" }, { status: 400 });
  }

  // Mock data for the payouts
  const payouts = [
    { date: `${year}-01-15`, amount: "500", currency: "USDC", txHash: "0x123abc..." },
    { date: `${year}-04-20`, amount: "1000", currency: "USDC", txHash: "0x456def..." },
    { date: `${year}-08-10`, amount: "750", currency: "USDC", txHash: "0x789ghi..." },
    { date: `${year}-12-05`, amount: "600", currency: "USDC", txHash: "0xabc123..." }
  ];

  const csvRows = [
    ["Date", "Amount", "Currency", "Transaction Hash"],
    ...payouts.map(p => [p.date, p.amount, p.currency, p.txHash])
  ];

  const csvString = csvRows.map(row => row.join(",")).join("\n");

  return new NextResponse(csvString, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="planter_tax_report_${planter}_${year}.csv"`,
    }
  });
}
