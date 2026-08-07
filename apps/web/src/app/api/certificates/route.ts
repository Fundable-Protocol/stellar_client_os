import { NextRequest, NextResponse } from "next/server";
import {
  generateCertificate,
  validateCertificateInput,
  CertificateError,
  type CertificateInput,
} from "@/services/certificate.service";

/**
 * POST /api/certificates
 *
 * Generates a downloadable high-resolution PDF contribution receipt or
 * invoice for a verified donor.
 *
 * @body {CertificateInput} — JSON body matching the CertificateInput shape.
 *
 * @returns
 *   200 — `application/pdf` binary stream with headers:
 *     - `Content-Disposition: attachment; filename="fundable-receipt-<id>.pdf"`
 *     - `X-Certificate-Id: <uuid>`
 *     - `X-Generated-At: <iso8601>`
 *   400 — `{ error: string }` — invalid input
 *   500 — `{ error: string }` — generation failure
 *
 * @example
 * ```ts
 * const res = await fetch("/api/certificates", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     donorName: "Alice",
 *     donorAddress: "GABC...",
 *     recipientName: "Green Planet Fund",
 *     transactionHash: "abc123...",
 *     network: "testnet",
 *     lineItems: [
 *       { description: "Stream #1", token: "USDC", amount: "500.00", timestamp: 1700000000 }
 *     ],
 *     totalAmount: "500.00 USDC",
 *   }),
 * });
 * const blob = await res.blob();
 * ```
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Run validation before the heavier PDF generation step
  try {
    validateCertificateInput(body as CertificateInput);
  } catch (err) {
    if (err instanceof CertificateError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const { pdfBytes, certificateId, generatedAt } = await generateCertificate(
      body as CertificateInput
    );

    const docType = (body as CertificateInput).documentType ?? "certificate";
    const filename = `fundable-${docType}-${certificateId}.pdf`;

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.byteLength.toString(),
        "X-Certificate-Id": certificateId,
        "X-Generated-At": generatedAt,
        // Prevent downstream caching of personalised PDFs
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof CertificateError) {
      const status = err.code === "INVALID_INPUT" ? 400 : 500;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[/api/certificates] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
