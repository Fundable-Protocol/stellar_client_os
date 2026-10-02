import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { checkHorizon, resolveHorizonUrl } from "@/lib/horizon-health";

// Mock the Horizon probe so route tests never make real network calls.
vi.mock("@/lib/horizon-health", () => ({
  checkHorizon: vi.fn(),
  resolveHorizonUrl: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveHorizonUrl).mockReturnValue("https://horizon-testnet.stellar.org");
});

function request(search = ""): NextRequest {
  return new NextRequest(`http://localhost/api/healthz${search}`);
}

describe("GET /api/healthz", () => {
  it("returns 200 with ok status when Horizon is reachable", async () => {
    vi.mocked(checkHorizon).mockResolvedValue({
      reachable: true,
      url: "https://horizon-testnet.stellar.org",
      latencyMs: 42,
      version: "2.34.0",
      error: null,
    });

    const res = await GET(request());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.app).toEqual({ status: "ok" });
    expect(body.checks.horizon).toEqual({
      status: "ok",
      url: "https://horizon-testnet.stellar.org",
      latencyMs: 42,
      version: "2.34.0",
    });
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns 503 when Horizon is unreachable", async () => {
    vi.mocked(checkHorizon).mockResolvedValue({
      reachable: false,
      url: "https://horizon-testnet.stellar.org",
      latencyMs: 5000,
      version: null,
      error: "Horizon probe timed out after 5000ms",
    });

    const res = await GET(request());

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("unhealthy");
    expect(body.checks.app).toEqual({ status: "ok" });
    expect(body.checks.horizon).toEqual({
      status: "down",
      url: "https://horizon-testnet.stellar.org",
      latencyMs: 5000,
      error: "Horizon probe timed out after 5000ms",
    });
  });

  it("skips the Horizon probe and returns 200 for ?check=app", async () => {
    const res = await GET(request("?check=app"));

    expect(res.status).toBe(200);
    expect(checkHorizon).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ app: { status: "ok" } });
  });

  it("resolves the Horizon URL from the environment", async () => {
    vi.mocked(checkHorizon).mockResolvedValue({
      reachable: true,
      url: "https://custom-horizon.example.org",
      latencyMs: 10,
      version: null,
      error: null,
    });

    await GET(request());

    expect(resolveHorizonUrl).toHaveBeenCalledOnce();
    expect(checkHorizon).toHaveBeenCalledWith("https://horizon-testnet.stellar.org");
  });

  it("sets Cache-Control: no-store on both healthy and unhealthy responses", async () => {
    vi.mocked(checkHorizon).mockResolvedValue({
      reachable: false,
      url: "https://horizon-testnet.stellar.org",
      latencyMs: null,
      version: null,
      error: "fetch failed",
    });

    const unhealthy = await GET(request());
    expect(unhealthy.headers.get("cache-control")).toBe("no-store");

    vi.mocked(checkHorizon).mockResolvedValue({
      reachable: true,
      url: "https://horizon-testnet.stellar.org",
      latencyMs: 10,
      version: null,
      error: null,
    });

    const healthy = await GET(request());
    expect(healthy.headers.get("cache-control")).toBe("no-store");
  });
});
