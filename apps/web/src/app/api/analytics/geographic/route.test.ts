/**
 * Tests for Geographic Heat Map API - Issue #1339
 */

import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";

describe("GET /api/analytics/geographic", () => {
  it("returns 400 when creatorAddress is missing", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic")
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("creatorAddress");
  });

  it("returns aggregated geographic data for valid creatorAddress", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...")
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("data");
    expect(data).toHaveProperty("totalBackers");
    expect(data).toHaveProperty("totalAmount");
    expect(data).toHaveProperty("totalAmountUsd");
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("returns data with proper country structure", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...")
    );

    const response = await GET(request);
    const data = await response.json();
    const firstCountry = data.data[0];

    expect(firstCountry).toHaveProperty("countryCode");
    expect(firstCountry).toHaveProperty("countryName");
    expect(firstCountry).toHaveProperty("backerCount");
    expect(firstCountry).toHaveProperty("pledgeAmount");
    expect(firstCountry).toHaveProperty("pledgeAmountUsd");
    expect(firstCountry).toHaveProperty("averagePledge");
  });

  it("includes campaignId filter in response metadata", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...&campaignId=campaign-456")
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.filters).toHaveProperty("campaignId");
    expect(data.filters.campaignId).toBe("campaign-456");
  });

  it("includes pledgeTier filter in response metadata", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...&pledgeTier=tier1,tier2")
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.filters).toHaveProperty("pledgeTiers");
    expect(data.filters.pledgeTiers).toEqual(["tier1", "tier2"]);
  });

  it("includes date range in response metadata when provided", async () => {
    const from = "2024-01-01";
    const to = "2024-12-31";
    const request = new NextRequest(
      new URL(`http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...&from=${from}&to=${to}`)
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.dateRange).toEqual({ from, to });
  });

  it("sets appropriate cache-control headers", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...")
    );

    const response = await GET(request);

    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  });

  it("does not expose individual backer information", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...")
    );

    const response = await GET(request);
    const data = await response.json();

    // Verify that response only contains aggregated data
    for (const country of data.data) {
      // Should not have individual backer addresses or personal info
      expect(country).not.toHaveProperty("backerAddresses");
      expect(country).not.toHaveProperty("backerNames");
      expect(country).not.toHaveProperty("backerEmails");
      expect(country).not.toHaveProperty("individualPledges");
      
      // Should only have aggregated metrics
      expect(typeof country.backerCount).toBe("number");
      expect(typeof country.pledgeAmount).toBe("string");
      expect(typeof country.pledgeAmountUsd).toBe("number");
    }
  });

  it("returns reasonable aggregated metrics", async () => {
    const request = new NextRequest(
      new URL("http://localhost:3000/api/analytics/geographic?creatorAddress=GTEST123...")
    );

    const response = await GET(request);
    const data = await response.json();

    expect(data.totalBackers).toBeGreaterThan(0);
    expect(data.totalAmountUsd).toBeGreaterThan(0);
    expect(data.data.length).toBeGreaterThan(0);

    // Verify totals match sum of individual countries
    const sumBackers = data.data.reduce((sum: number, c: any) => sum + c.backerCount, 0);
    expect(sumBackers).toBe(data.totalBackers);
  });
});
