import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { yieldStrategyService } from "@/services/yield-strategy.service";

const EnableYieldSchema = z.object({
  strategyId: z.string().min(1, "Strategy ID is required"),
});

const EmergencyWithdrawalSchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

/**
 * GET /api/campaigns/[id]/yield
 *
 * Get yield configuration and summary for a campaign.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = await yieldStrategyService.getCampaignConfig(id);
    const deposits = await yieldStrategyService.getCampaignDeposits(id);
    const transactions = await yieldStrategyService.getCampaignTransactions(id);
    const milestoneYield = await yieldStrategyService.getMilestoneYieldSummary(id);
    const liquidityAlert = await yieldStrategyService.checkLiquidityStress(id);

    return NextResponse.json({
      config,
      deposits,
      transactions,
      milestoneYield,
      liquidityAlert,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to retrieve yield data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/yield/enable
 *
 * Enable yield generation for a campaign.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = EnableYieldSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { strategyId } = parsed.data;
    const config = await yieldStrategyService.enableYieldForCampaign(id, strategyId);

    return NextResponse.json(config, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to enable yield" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]/yield
 *
 * Disable yield generation for a campaign.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = await yieldStrategyService.disableYieldForCampaign(id);

    if (!success) {
      return NextResponse.json({ error: "Yield config not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to disable yield" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/campaigns/[id]/yield/emergency-withdraw
 *
 * Execute emergency withdrawal of all yield deposits.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "emergency_withdraw") {
      const body = await req.json();
      const parsed = EmergencyWithdrawalSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const result = await yieldStrategyService.emergencyWithdraw(id, parsed.data.reason);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to execute action" },
      { status: 500 }
    );
  }
}
