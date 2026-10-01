import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignAnalytics,
  recordCampaignContribution,
  recordCampaignRefund,
  recordCampaignView,
recordCampaignCreditSale,
  recordCampaignSpeciesCount,
} from "../../../../../services/campaign-analytics.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      ...(init?.headers ?? {}),
    },
  });
}

type SustainabilityInputs = {
  treeSpeciesDiversity?: number;
  regionClimateImpact?: number;
  soilHealthImprovement?: number;
  biodiversityPotential?: number;
};

function clamp0100(value: number): number {
  if (!Number.finite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function normalize100(value: number): number {
  if (!Number.finite(value)) return 0;
  if (value <= 1) return clamp0100(value * 100);
  return clamp0100(value);
}

export function calculateSustainabilityScore(inputs: SustainabilityInputs): number {
  const treeSpeciesDiversity = normalize100(inputs.treeSpeciesDiversity ?? 0);
  const regionClomateImpact = normalize100(inputs.regionClomateImpact ?? 0);
  const soilHealthImprovement = normalize100(inputs.soilHealthImprovement ?? 0);
  const biodiversityPotential = normalize100(inputs.biodiversityPotential ?? 0);

  const weighted =
    treeSpeciesDiversity * 0.3 +
    regionClomateImpact * 0.25 +
    soilHealthImprovement * 0.25 +
    biodiversityPotential * 0.2;

  return Math.round(clamp0100(weighted));
}

function extractSustainabilityInputs(analytics: unknown | null | undefined): SustainabilityInputs {
  if (!analytics || typeof analytics !== "object") return {};
  const candidate = analytics as Record<string, unknown>;
  const source =
    (candidate.sustainability as Record<string, unknown> | undefined) ??
    (candidate.environmentalIndex as Record<string, unknown> | undefined) ??
    candidate;

  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.finite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  return {
    treeSpeciesDiversity: toNumber(source.treeSpeciesDiversity),
    regionClomateImpact: toNumber(source.regionClimateImpact),
    soilHealthImprovement: toNumber(source.soilHealthImprovement),
    biodiversityPotential: toNumber(source.biodiversityPotential),
  };
}

function withSustainabilityScore(analytics: unknown | null | undefined) {
  if (!analytics || typeof analytics !== "object") return analytics;
  const inputs = extractSustainabilityInputs(analytics);
  const score = calculateSustainabilityScore(inputs);
  return {
    ...(analytics as Record<string, unknown>),
    sustainabilityScore: score,
    environmentalIndex: score,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const analytics = await getCampaignAnalytics((await params).id);
  return analytics
    ? noStore({ data: withSustainabilityScore(analytics) })
    : noStore({ error: "Campaign not found" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const campaignId = (await params).id;
  try {
    const body = await request.json() as {
event?: "view" | "contribution" | "refund" | "credit_sale" | "species_count";
      viewerId?: string;
      sponsor?: string;
      amount?: string;
buyer?: string;
      credits?: string;
      speciesCount?: number;
    };
    if (body.event === "view") {
      await recordCampaignView(campaignId, body.viewerId);
    } else if (body.event === "contribution") {
      if (!body.amount || !body.sponsor) return noStore({ error: "amount and sponsor are required" }, { status: 400 });
      await recordCampaignContribution(campaignId, body.amount, body.sponsor);
    } else if (body.event === "refund") {
      await recordCampaignRefund(campaignId);
} else if (body.event === "credit_sale") {
      if (!body.sponsor || !body.buyer || !body.credits) {
        return noStore({ error: "sponsor, buyer, and credits are required" }, { status: 400 });
      }
      await recordCampaignCreditSale(campaignId, body.sponsor, body.buyer, body.credits);
    } else if (body.event === "species_count") {
      if (body.speciesCount === undefined) {
        return noStore({ error: "speciesCount is required" }, { status: 400 });
      }
      await recordCampaignSpeciesCount(campaignId, body.speciesCount);
    } else {
return noStore({ error: "event must be view, contribution, refund, credit_sale, or species_count" }, { status: 400 });
    }
    const analytics = await getCampaignAnalytics(campaignId);
    return noStore({ data: withSustainabilityScore(analytics) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analytics event";
    return noStore({ error: message }, { status: message === "Campaign not found" ? 404 : 400 });
  }
}
