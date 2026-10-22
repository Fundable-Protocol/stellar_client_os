import { NextRequest, NextResponse } from "next/server";
import { yieldStrategyService } from "@/services/yield-strategy.service";

/**
 * GET /api/yield/strategies
 *
 * List all available yield strategies.
 */
export async function GET(_req: NextRequest) {
  try {
    const strategies = await yieldStrategyService.getStrategies();
    return NextResponse.json(strategies);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: message || "Failed to retrieve strategies" },
      { status: 500 }
    );
  }
}
