import { NextResponse } from "next/server";
import { campaignVerificationQueue } from "@/services/campaign-verification-queue.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      idempotencyKey?: string;
      network?: "testnet" | "mainnet";
      contractId?: string;
      campaignId?: string;
      plantingId?: string | number;
    };
    if (!body.idempotencyKey?.trim()) throw new Error("idempotencyKey is required");
    if (!body.contractId?.trim()) throw new Error("contractId is required");
    if (!body.campaignId?.trim()) throw new Error("campaignId is required");
    if (body.plantingId === undefined || !/^\d+$/.test(String(body.plantingId))) {
      throw new Error("plantingId must be a non-negative integer");
    }
    const result = campaignVerificationQueue.enqueue({
      idempotencyKey: body.idempotencyKey.trim(),
      network: body.network ?? "testnet",
      contractId: body.contractId.trim(),
      campaignId: body.campaignId.trim(),
      plantingId: String(body.plantingId),
    });
    return NextResponse.json(result, { status: result.created ? 202 : 200, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid verification job" },
      { status: 400, headers: NO_STORE },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  const campaignId = url.searchParams.get("campaignId") ?? undefined;
  if (jobId) {
    const job = campaignVerificationQueue.getJob(jobId);
    return job
      ? NextResponse.json({ job }, { headers: NO_STORE })
      : NextResponse.json({ error: "Verification job not found" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ jobs: campaignVerificationQueue.listJobs(campaignId) }, { headers: NO_STORE });
}
