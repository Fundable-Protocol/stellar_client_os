import {
  buildTaxComplianceCsv,
  buildTaxCompliancePdf,
  buildTaxComplianceReport,
  type TaxReportFormat,
  type TaxReportRole,
} from "@/services/tax-compliance-report.service";

export const runtime = "nodejs";

function validRole(value: string | null): value is TaxReportRole {
  return value === "creator" || value === "backer";
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "wallet";
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const walletAddress = search.get("wallet")?.trim() ?? "";
  const taxYear = Number(search.get("year"));
  const roleValue = search.get("role");
  const formatValue = search.get("format") ?? "csv";

  if (!walletAddress || !Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100 || !validRole(roleValue)) {
    return Response.json({ error: "Provide a wallet, a valid year, and role=creator or backer." }, { status: 400 });
  }
  if (formatValue !== "csv" && formatValue !== "pdf") {
    return Response.json({ error: "Invalid format. Use csv or pdf." }, { status: 400 });
  }

  try {
    const report = await buildTaxComplianceReport(walletAddress, taxYear, roleValue);
    const filename = `fundable-tax-${roleValue}-${taxYear}-${safeFilenamePart(walletAddress)}`;
    const headers = {
      "Content-Disposition": `attachment; filename="${filename}.${formatValue}"`,
      "Cache-Control": "private, no-store",
    };
    if (formatValue === "csv") {
      return new Response(buildTaxComplianceCsv(report), {
        status: 200,
        headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
      });
    }
    return new Response(await buildTaxCompliancePdf(report), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/pdf" },
    });
  } catch (error) {
    console.error("[api/tax/compliance-report] Report generation failed", error);
    return Response.json({ error: "Unable to generate the tax report." }, { status: 500 });
  }
}
