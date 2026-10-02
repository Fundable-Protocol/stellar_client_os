import {
  generateTaxDocument,
  loadCreatorTaxYearEarnings,
  selectTaxDocumentType,
  SUPPORTED_TAX_DOCUMENT_TYPES,
  TaxDocumentError,
  type TaxJurisdiction,
  type TaxDocumentType,
} from "@/services/tax.service";

export const runtime = "nodejs";

function isTaxJurisdiction(value: unknown): value is TaxJurisdiction {
  return value === "US" || value === "EU" || value === "OTHER";
}

function isTaxDocumentType(value: unknown): value is TaxDocumentType {
  return SUPPORTED_TAX_DOCUMENT_TYPES.some((form) => form.documentType === value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    const creatorId = typeof body?.creatorId === "string" ? body.creatorId.trim() : "";
    const taxYear = Number(body?.taxYear);

    if (!creatorId || !Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return Response.json(
        { error: "Missing required fields: creatorId and a valid taxYear" },
        { status: 400 },
      );
    }

    let documentType: TaxDocumentType;
    if (body?.documentType !== undefined) {
      if (typeof body.documentType !== "string" || !isTaxDocumentType(body.documentType)) {
        return Response.json(
          {
            error: `Unsupported documentType. Use one of: ${SUPPORTED_TAX_DOCUMENT_TYPES.map((f) => f.documentType).join(", ")}`,
          },
          { status: 400 },
        );
      }
      documentType = body.documentType;
    } else if (isTaxJurisdiction(body?.jurisdiction)) {
      documentType = selectTaxDocumentType(body.jurisdiction);
    } else {
      documentType = "us-1099-nec";
    }

    const { grossEarningsUSDC, totalTransactions } = await loadCreatorTaxYearEarnings(creatorId, taxYear);

    const result = await generateTaxDocument({
      creatorId,
      taxYear,
      documentType,
      grossEarningsUSDC,
      totalTransactions,
      creatorName: typeof body?.creatorName === "string" ? body.creatorName : undefined,
      taxId: typeof body?.taxId === "string" ? body.taxId : undefined,
    });

    const filename = `tax-${documentType}-${taxYear}-${creatorId}.pdf`;
    return new Response(Buffer.from(result.pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status =
      error instanceof TaxDocumentError && error.code === "INVALID_INPUT" ? 400 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status },
    );
  }
}