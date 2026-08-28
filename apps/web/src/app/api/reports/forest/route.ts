import { NextRequest, NextResponse } from "next/server";
import {
  buildForestReportPdf,
  validateForestReportInput,
  type ForestReportInput,
} from "@/services/forest-report.service";

export const runtime = "nodejs";

function isForestReportInput(value: unknown): value is ForestReportInput {
  return Boolean(value && typeof value === "object" && "trees" in value);
}

/**
 * POST /api/reports/forest
 *
 * Generates a PDF from the sponsor forest records supplied by the dashboard.
 * The endpoint intentionally accepts records rather than reading a data store:
 * the current client has no tree registry, and this keeps the report contract
 * ready for the backend tree service without inventing production data here.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isForestReportInput(body)) {
    return NextResponse.json(
      { error: "A sponsor forest report payload is required" },
      { status: 400 }
    );
  }

  try {
    validateForestReportInput(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid report payload" },
      { status: 400 }
    );
  }

  try {
    const pdfBytes = await buildForestReportPdf(body);
    const filename = `fundable-sponsor-forest-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.byteLength.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[api/reports/forest] PDF generation failed", error);
    return NextResponse.json(
      { error: "Unable to generate the forest report" },
      { status: 500 }
    );
  }
}
