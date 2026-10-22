/**
 * Geographic Heat Map API - Issue #1339
 * 
 * Provides aggregated geographic data for backer distribution by country/region.
 * Privacy-preserving: returns only aggregated counts, no PII.
 */

import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/middlewares/rate-limit.middleware";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface GeographicBackerData {
  countryCode: string;
  countryName: string;
  backerCount: number;
  pledgeAmount: string; // in stroops
  pledgeAmountUsd: number;
  averagePledge: number;
}

export interface GeographicHeatMapResponse {
  data: GeographicBackerData[];
  totalBackers: number;
  totalAmount: string;
  totalAmountUsd: number;
  dateRange?: {
    from: string;
    to: string;
  };
  filters?: {
    pledgeTiers?: string[];
    campaignId?: string;
  };
}

/**
 * Get aggregated geographic data for a creator's campaigns.
 * 
 * Query parameters:
 * - creatorAddress: Creator wallet address (required)
 * - campaignId: Filter by specific campaign (optional)
 * - pledgeTier: Filter by pledge tier (optional, comma-separated)
 * - from: Start date ISO string (optional)
 * - to: End date ISO string (optional)
 */
async function handler(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const creatorAddress = searchParams.get("creatorAddress");
  const campaignId = searchParams.get("campaignId");
  const pledgeTier = searchParams.get("pledgeTier");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!creatorAddress) {
    return NextResponse.json(
      { error: "creatorAddress query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const geoData = await getGeographicBackerData({
      creatorAddress,
      campaignId: campaignId || undefined,
      pledgeTiers: pledgeTier ? pledgeTier.split(",") : undefined,
      dateRange: from && to ? { from, to } : undefined,
    });

    return NextResponse.json(geoData, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error fetching geographic data:", error);
    return NextResponse.json(
      { error: "Failed to fetch geographic data" },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(handler, { maxRequests: 30, windowMs: 60000 });

/**
 * Aggregate backer geographic data with privacy preservation.
 * In production, this would query an anonymized analytics database.
 */
async function getGeographicBackerData(params: {
  creatorAddress: string;
  campaignId?: string;
  pledgeTiers?: string[];
  dateRange?: { from: string; to: string };
}): Promise<GeographicHeatMapResponse> {
  // Demo data - in production this would query the database with proper aggregation
  // All data is aggregated by country, no individual backer information exposed
  const STROOPS_PER_USD = 10_000_000;
  
  // Simulated aggregated data from blockchain analytics
  const demoGeoData: GeographicBackerData[] = [
    {
      countryCode: "US",
      countryName: "United States",
      backerCount: 145,
      pledgeAmount: "7250000000", // 725 USD equivalent
      pledgeAmountUsd: 725.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "GB",
      countryName: "United Kingdom",
      backerCount: 87,
      pledgeAmount: "4350000000",
      pledgeAmountUsd: 435.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "DE",
      countryName: "Germany",
      backerCount: 76,
      pledgeAmount: "3800000000",
      pledgeAmountUsd: 380.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "CA",
      countryName: "Canada",
      backerCount: 62,
      pledgeAmount: "3100000000",
      pledgeAmountUsd: 310.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "AU",
      countryName: "Australia",
      backerCount: 54,
      pledgeAmount: "2700000000",
      pledgeAmountUsd: 270.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "FR",
      countryName: "France",
      backerCount: 48,
      pledgeAmount: "2400000000",
      pledgeAmountUsd: 240.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "JP",
      countryName: "Japan",
      backerCount: 41,
      pledgeAmount: "2050000000",
      pledgeAmountUsd: 205.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "NL",
      countryName: "Netherlands",
      backerCount: 35,
      pledgeAmount: "1750000000",
      pledgeAmountUsd: 175.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "SE",
      countryName: "Sweden",
      backerCount: 29,
      pledgeAmount: "1450000000",
      pledgeAmountUsd: 145.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "CH",
      countryName: "Switzerland",
      backerCount: 24,
      pledgeAmount: "1200000000",
      pledgeAmountUsd: 120.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "BR",
      countryName: "Brazil",
      backerCount: 33,
      pledgeAmount: "1650000000",
      pledgeAmountUsd: 165.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "IN",
      countryName: "India",
      backerCount: 56,
      pledgeAmount: "2800000000",
      pledgeAmountUsd: 280.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "SG",
      countryName: "Singapore",
      backerCount: 28,
      pledgeAmount: "1400000000",
      pledgeAmountUsd: 140.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "KR",
      countryName: "South Korea",
      backerCount: 31,
      pledgeAmount: "1550000000",
      pledgeAmountUsd: 155.00,
      averagePledge: 5.00,
    },
    {
      countryCode: "MX",
      countryName: "Mexico",
      backerCount: 22,
      pledgeAmount: "1100000000",
      pledgeAmountUsd: 110.00,
      averagePledge: 5.00,
    },
  ];

  // Apply filtering based on parameters
  let filteredData = [...demoGeoData];

  // In production: apply campaignId filter, pledgeTiers filter, dateRange filter
  // These would be SQL WHERE clauses on the aggregated query

  const totalBackers = filteredData.reduce((sum, d) => sum + d.backerCount, 0);
  const totalAmountNum = filteredData.reduce(
    (sum, d) => sum + Number(d.pledgeAmount),
    0
  );
  const totalAmountUsd = filteredData.reduce(
    (sum, d) => sum + d.pledgeAmountUsd,
    0
  );

  return {
    data: filteredData,
    totalBackers,
    totalAmount: totalAmountNum.toString(),
    totalAmountUsd,
    dateRange: params.dateRange,
    filters: {
      pledgeTiers: params.pledgeTiers,
      campaignId: params.campaignId,
    },
  };
}
