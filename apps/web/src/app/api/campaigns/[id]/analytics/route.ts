import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignAnalytics,
  recordCampaignContribution,
  recordCampaignRefund,
  recordCampaignView,
  recordCampaignCreditSale,
} from "../../../../services/campaign-analytics.service";
import { fundInsurancePool } from "../../../../services/campaign-insurance.service";
import { isDonationToken } from "@/types/campaign-insurance";

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

const GEOGRAPHIC_DIVERSITY_BONUS = 1.2;

function countryCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[a-A-z]{2}$/.test(normalized)) return null;
  return normalized;
}

function countryCodesFromCampaign(campaign: unknown): Set<string> {
  const codes = new Set<string>();
  if (!campaign || typeof campaign !== "object") return codes;
  const record = campaign as Record<string, unknown>;
  const candidates = [
    record.country,
    record.countryCode,
    record.location,
  ];
  const list = record.countries;
  if (Array.isArray(list)) candidates.push(...list);
  for (const candidate of candidates) {
    const code = countryCode(candidate);
    if (code) codes.add(code);
  }
  return codes;
}

function applyGeographicDiversityIncentive(analytics: unknown): unknown {
  if (!analytics || typeof analytics !== "object") return analytics;
  const record = analytics as Record<string, unknown>;
  const countries = countryCodesFromCampaign(record.campaign);
  const countryCount = countries.size;
  const qualifies = countryCount > 1;
  const multiplier = qualifies ? GEOGRAPHIC_DIVERSITY_BONUS : 1;
  const credits = record.credits;
  if (typeof credits === "number") {
    record.credits = credits * multiplier;
  }
  record.geographicDiversity = {
    countries: Array.from(countries),
    countryCount,
    qualifies,
    multiplier,
  };
  return record;
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
  const regionClimateImpact = normalize100(inputs.regionClimateImpact ?? 0);
  const soilHealthImprovement = normalize100(inputs.soilHealthImprovement ?? 0);
  const biodiversityPotential = normalize100(inputs.biodiversityPotential ?? 0);

  const weighted =
    treeSpeciesDiversity * 0.3 +
    regionClimateImpact * 0.25 +
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
    regionClimateImpact: toNumber(source.regionClimateImpact),
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
    ? noStore({ data: applyGeographicDiversityIncentive(withSustainabilityScore(analytics)) })
    : noStore({ error: "Campaign not found" }, { status: 404 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const campaignId = (await params).id;
  try {
    const body = await request.json() as {
      event?: "view" | "contribution" | "refund" | "credit_sale";
      viewerId?: string;
      sponsor?: string;
      amount?: string;
      token?: string;
      buyer?: string;
      credits?: string;
    };
    if (body.event === "view") {
      await recordCampaignView(campaignId, body.viewerId);
    } else if (body.event === "contribution") {
      if (!body.amount || !body.sponsor) return noStore({ error: "amount and sponsor are required" }, { status: 400 });
      await recordCampaignContribution(campaignId, body.amount, body.sponsor);
      const token = body.token ?? "XLM";
      if (!isDonationToken(token)) return noStore({ error: "Unsupported token" }, { status: 400 });
      await fundInsurancePool(campaignId, body.amount, token);
    } else if (body.event === "refund") {
      await recordCampaignRefund(campaignId);
    } else if (body.event === "credit_sale") {
      if (!body.sponsor || !body.buyer || !body.credits) {
        return noStore({ error: "sponsor, buyer, and credits are required" }, { status: 400 });
      }
      await recordCampaignCreditSale(campaignId, body.sponsor, body.buyer, body.credits);
    } else {
      return noStore({ error: "event must be view, contribution, refund, or credit_sale" }, { status: 400 });
    }
    const analytics = await getCampaignAnalytics(campaignId);
return noStore({ data: applyGeographicDiversityIncentive(withSustainabilityScore(analytics)) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid analytics event";
    return noStore({ error: message }, { status: message === "Campaign not found" ? 404 : 400 });
  }
}
