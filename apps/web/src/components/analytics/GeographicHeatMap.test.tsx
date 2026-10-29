/**
 * Tests for Geographic Heat Map Component - Issue #1339
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GeographicHeatMap } from "./GeographicHeatMap";

// Mock fetch
global.fetch = vi.fn();

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("GeographicHeatMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockGeoData = {
    data: [
      {
        countryCode: "US",
        countryName: "United States",
        backerCount: 145,
        pledgeAmount: "7250000000",
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
    ],
    totalBackers: 232,
    totalAmount: "11600000000",
    totalAmountUsd: 1160.00,
  };

  it("renders loading state initially", () => {
    (global.fetch as any).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <GeographicHeatMap creatorAddress="GTEST123..." />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  it("displays geographic data after loading", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGeoData,
    });

    render(
      <GeographicHeatMap creatorAddress="GTEST123..." />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText("Backer Geographic Distribution")).toBeDefined();
    });

    expect(screen.getByText(/232 backers from 2 countries/i)).toBeDefined();
    expect(screen.getByText("United States")).toBeDefined();
    expect(screen.getByText("United Kingdom")).toBeDefined();
  });

  it("displays total statistics correctly", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGeoData,
    });

    render(
      <GeographicHeatMap creatorAddress="GTEST123..." />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText("232")).toBeDefined();
    });

    expect(screen.getByText(/\$1,160\.00/)).toBeDefined();
  });

  it("shows error state on fetch failure", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(
      <GeographicHeatMap creatorAddress="GTEST123..." />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load geographic data/i)).toBeDefined();
    });
  });

  it("includes campaignId in query params when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockGeoData,
    });
    global.fetch = mockFetch;

    render(
      <GeographicHeatMap 
        creatorAddress="GTEST123..." 
        campaignId="campaign-456"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain("creatorAddress=GTEST123...");
    expect(callUrl).toContain("campaignId=campaign-456");
  });

  it("renders export buttons", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGeoData,
    });

    render(
      <GeographicHeatMap creatorAddress="GTEST123..." />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText("Export SVG")).toBeDefined();
    });

    expect(screen.getByText("Export PNG")).toBeDefined();
  });

  it("displays top countries list", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGeoData,
    });

    render(
      <GeographicHeatMap creatorAddress="GTEST123..." />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText("Top Countries by Backers")).toBeDefined();
    });

    expect(screen.getByText("145 backers")).toBeDefined();
    expect(screen.getByText("87 backers")).toBeDefined();
  });

  it("preserves privacy by not exposing individual backer data", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockGeoData,
    });

    const { container } = render(
      <GeographicHeatMap creatorAddress="GTEST123..." />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(screen.getByText("Backer Geographic Distribution")).toBeDefined();
    });

    // Ensure no individual names, addresses, or PII are rendered
    const text = container.textContent || "";
    expect(text).not.toMatch(/[A-Z0-9]{56}/); // Stellar address pattern
    expect(text).not.toMatch(/email/i);
    expect(text).not.toMatch(/phone/i);
  });
});
