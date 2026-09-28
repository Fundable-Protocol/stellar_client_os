import {
  CampaignTaxCertificateError,
  generateCampaignTaxCertificate,
} from "../../../../../services/campaign-tax-certificate.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const url = new URL(request.url);
  const sponsorAddress = url.searchParams.get("sponsorAddress") ?? "";
  const taxYear = Number(url.searchParams.get("taxYear"));

  try {
    const certificate = await generateCampaignTaxCertificate(
      (await params).id,
      sponsorAddress,
      taxYear,
    );
    return new Response(Buffer.from(certificate.pdfBytes), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="charitable-contribution-${certificate.certificateId}.pdf"`,
      },
    });
  } catch (error) {
    const code = error instanceof CampaignTaxCertificateError ? error.code : undefined;
    const status = code === "INVALID_INPUT" ? 400
      : code === "CAMPAIGN_NOT_FOUND" || code === "NO_CONTRIBUTIONS" ? 404
      : code === "INELIGIBLE_CAMPAIGN" ? 403
      : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not generate certificate" },
      { status, headers: NO_STORE_HEADERS },
    );
  }
}