import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getCampaignAnalyticsDashboard,
  recordBackerContribution,
  recordFunnelStep,
  recordTrafficSource,
} from "../../../../../../services/campaign-analytics-dashboard.service";
import { getCampaignAnalytics } from "../../../../../../services/campaign-analytics.service";
import { fundInsurancePool } from "../../../../../../services/campaign-insurance.service";
import { isDonationToken } from "@/types/campaign-insurance";
import {
  buyCarbonCredits,
  listCarbonCreditOffers,
  sellCarbonCredits,
} from "../../../../../../services/carbon-credit-market.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TrafficSourceSchema = z.object({
  source: z.enum(["direct", "search", "social", "referral", "newsletter"]),
  viewerId: z.string().optional(),
});

const FunnelSchema = z.object({
  stage: z.enum(["view", "click_sponsor", "contribute", "confirm"]),
  viewerId: z.string().min(1),
});

const ContributionSchema = z.object({
  event: z.literal("contribution"),
  amount: z.string().min(1),
  backerId: z.string().min(1),
  region: z.string().optional(),
  at: z.number().optional(),
  token: z.string().optional(),
});

const CarbonSellSchema = z.object({
  event: z.literal("sell_carbon_credits"),
  sellerId: z.string().min(1),
  amount: z.number().positive(),
  pricePerTon: z.number().positive(),
});

const CarbonPurchaseSchema = z.object({
  event: z.literal("buy_carbon_credits"),
  buyerId: z.string().min(1),
  listingId: z.string().min(1),
  amount: z.number().positive(),
});

const SustainabilityInputsSchema = z.object({
  treeSpeciesDiversity: z.number().min(0).max(1),
  regionClimateImpact: z.number().min(0).max(1),
  soilHealthImprovement: z.number().min(0).max(1),
  biodiversityPotential: z.number().min(0).max(1),
});

const SustainabilityScoreWeights = {
  treeSpeciesDiversity: 0.3,
  regionClimateImpact: 0.25,
  soilHealthImprovement: 0.2,
  biodiversityPotential: 0.25,
} as const;

type SustainabilityInputs = z.infer<typeof SustainabilityInputsSchema>;

function computeSustainabilityScore(inputs: SustainabilityInputs) {
  const weighted =
    inputs.treeSpeciesDiversity * SustainabilityScoreWeights.treeSpeciesDiversity +
    inputs.regionClimateImpact * SustainabilityScoreWeights.regionClimateImpact +
    inputs.soilHealthImprovement * SustainabilityScoreWeights.soilHealthImprovement +
    inputs.biodiversityPotential * SustainabilityScoreWeights.biodiversityPotential;
  const score = Math.round(weighted * 100);
  return Math.max(0, Math.min(100, score));
}

function noStore<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * GET /api/campaigns/:id/analytics/dashboard
 *
 * Returns the detailed creator analytics dashboard: traffic sources,
 * conversion funnel, backer demographics, reward tier popularity, and
 * daily funding trends. Also includes the campaign's secondary carbon
 * credit market listings.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const dashboard = await getCampaignAnalyticsDashboard(id);
  if (!dashboard) return noStore({ error: "Campaign not found" }, { status: 404 });
  const vertex = await getCampaignAnalytics(id);
  const carbonPricing = await listCarbonCreditOffers(id);
  const sustainabilityInputs = SustainabilityInputsSchema.safeParse(dashboard.sustainability ?? {});
  const sustainability = sustainabilityInputs.success
    ? {
        inputs: sustainabilityInputs.data,
        score: computeSustainabilityScore(sustainabilityInputs.data),
        weights: SustainabilityScoreWeights,
      }
    : null;
  return noStore({ data: { ...dashboard, vertex, carbonPricing, sustainability } });
}

/**
 * POST /api/campaigns/:id/analytics/dashboard
 *
 * Records a traffic-source visit, a funnel step, a backer contribution,
 * or a secondary-market carbon credit trade for the campaign dashboard.
 * Body shape:
 *   { event: "traffic", source, viewerId? }
 *   { event: "funnel", stage, viewerId }
 *   { event: "contribution", amount, backerId, region? }
 *   { event: "sell_carbon_credits", sellerId, amount, pricePerTon }
 *   { event: "buy_carbon_credits", buyerId, listingId, amount }
 *
 * Contributions automatically fund the campaign insurance pool at 1% of the
 * contributed amount.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.event === "traffic") {
      const parsed = TrafficSourceSchema.safeParse(body);
      if (!parsed.success) {
        return noStore({ error: "Invalid traffic payload", details: parsed.error.flatten() }, { status: 400 });
      }
      await recordTrafficSource(id, parsed.data.source, parsed.data.viewerId);
    } else if (body.event === "funnel") {
      const parsed = FunnelSchema.safeParse(body);
      if (!parsed.success) {
        return noStore({ error: "Invalid funnel payload", details: parsed.error.flatten() }, { status: 400 });
      }
      await recordFunnelStep(id, parsed.data.stage, parsed.data.viewerId);
    } else if (body.event === "contribution") {
      const parsed = ContributionSchema.safeParse({ ...body });
      if (!parsed.success) {
        return noStore({ error: "Invalid contribution payload", details: parsed.error.flatten() }, { status: 400 });
      }
      await recordBackerContribution(id, parsed.data);
      const token = parsed.data.token ?? "XLM";
      if (!isDonationToken(token)) {
        return noStore({ error: "Unsupported token" }, { status: 400 });
      }
      await fundInsurancePool(id, parsed.data.amount, token);
    } else if (body.event === "sell_carbon_credits") {
      const parsed = CarbonSellSchema.safeParse(body);
      if (!parsed.success) {
        return noStore({ error: "Invalid carbon credit sell payload", details: parsed.error.flatten() }, { status: 400 });
      }
      await sellCarbonCredits(id, parsed.data);
    } else if (body.event === "buy_carbon_credits") {
      const parsed = CarbonPurchaseSchema.safeParse(body);
      if (!parsed.success) {
        return noStore({ error: "Invalid carbon credit purchase payload", details: parsed.error.flatten() }, { status: 400 });
      }
      await buyCarbonCredits(id, parsed.data);
    } else {
      return noStore({ error: "event must be traffic, funnel, contribution, sell_carbon_credits, or buy_carbon_credits" }, { status: 400 });
    }
    const dashboard = await getCampaignAnalyticsDashboard(id);
    return noStore({ data: dashboard }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid analytics event";
    return noStore({ error: message }, { status: message === "Campaign not found" ? 404 : 400 });
  }
}
