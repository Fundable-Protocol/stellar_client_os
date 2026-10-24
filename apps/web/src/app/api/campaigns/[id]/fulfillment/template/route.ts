export const runtime = "nodejs";

import { generateFulfillmentCSVTemplate } from "@/services/reward-fulfillment.service";

export async function GET() {
  const csvContent = generateFulfillmentCSVTemplate();
  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="reward-fulfillment-template.csv"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
