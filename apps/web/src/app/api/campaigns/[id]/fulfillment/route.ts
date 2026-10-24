export const runtime = "nodejs";

import {
  rewardFulfillmentService,
  parseFulfillmentCSV,
} from "@/services/reward-fulfillment.service";
import { RewardFulfillmentInput } from "@/types/reward-fulfillment";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  rewardFulfillmentService.seedDemoFulfillments(id);
  const records = rewardFulfillmentService.getFulfillments(id);
  return Response.json({ campaignId: id, fulfillments: records });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("text/csv") || contentType.includes("application/csv")) {
      const csvText = await request.text();
      const parseResult = parseFulfillmentCSV(csvText);
      if (!parseResult.isValid) {
        return Response.json(
          {
            error: "CSV validation failed",
            diagnostics: parseResult,
          },
          { status: 400 },
        );
      }
      const inputs = parseResult.rows.map((r) => r.record!).filter(Boolean);
      const saved = rewardFulfillmentService.saveFulfillments(id, inputs);
      return Response.json({ success: true, count: saved.length, fulfillments: saved }, { status: 201 });
    }

    const body = (await request.json()) as { records?: RewardFulfillmentInput[] };
    if (!body.records || !Array.isArray(body.records)) {
      return Response.json({ error: "Invalid payload: 'records' array is required" }, { status: 400 });
    }

    const saved = rewardFulfillmentService.saveFulfillments(id, body.records);
    return Response.json({ success: true, count: saved.length, fulfillments: saved }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save fulfillments";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { id: string; update: Record<string, unknown> };
    if (!body.id || !body.update) {
      return Response.json({ error: "Both 'id' and 'update' are required" }, { status: 400 });
    }

    const updated = rewardFulfillmentService.updateFulfillment(id, body.id, body.update);
    return Response.json({ success: true, fulfillment: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update fulfillment";
    return Response.json({ error: message }, { status: 400 });
  }
}
