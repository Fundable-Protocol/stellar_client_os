import { describe, expect, it, vi } from "vitest";
import {
  checkHorizon,
  resolveHorizonUrl,
  DEFAULT_HORIZON_MAINNET,
  DEFAULT_HORIZON_TESTNET,
} from "./horizon-health";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

describe("resolveHorizonUrl", () => {
  it("uses NEXT_PUBLIC_STELLAR_HORIZON_URL when set", () => {
    const url = resolveHorizonUrl({
      NEXT_PUBLIC_STELLAR_HORIZON_URL: "https://custom-horizon.example.org",
      NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
    } as NodeJS.ProcessEnv);
    expect(url).toBe("https://custom-horizon.example.org");
  });

  it("falls back to mainnet default when network is mainnet", () => {
    expect(resolveHorizonUrl({ NEXT_PUBLIC_STELLAR_NETWORK: "mainnet" } as NodeJS.ProcessEnv)).toBe(
      DEFAULT_HORIZON_MAINNET
    );
  });

  it("falls back to testnet default when network is unset or testnet", () => {
    expect(resolveHorizonUrl({} as NodeJS.ProcessEnv)).toBe(DEFAULT_HORIZON_TESTNET);
    expect(
      resolveHorizonUrl({ NEXT_PUBLIC_STELLAR_NETWORK: "testnet" } as NodeJS.ProcessEnv)
    ).toBe(DEFAULT_HORIZON_TESTNET);
  });

  it("prefers the explicit URL over the network default on mainnet", () => {
    const url = resolveHorizonUrl({
      NEXT_PUBLIC_STELLAR_HORIZON_URL: "https://custom-horizon.example.org",
      NEXT_PUBLIC_STELLAR_NETWORK: "mainnet",
    } as NodeJS.ProcessEnv);
    expect(url).toBe("https://custom-horizon.example.org");
  });
});

describe("checkHorizon", () => {
  it("returns reachable with version and latency on a healthy 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ horizon_version: "2.34.0", core_version: "v21.3.0" })
    );

    const result = await checkHorizon("https://horizon-testnet.stellar.org", { fetchImpl });

    expect(result.reachable).toBe(true);
    expect(result.version).toBe("2.34.0");
    expect(result.error).toBeNull();
    expect(typeof result.latencyMs).toBe("number");
    // Probes the root endpoint without a trailing-slash double
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://horizon-testnet.stellar.org/",
      expect.objectContaining({ method: "GET", signal: expect.anything() })
    );
  });

  it("treats a non-2xx response as unreachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 }));

    const result = await checkHorizon("https://horizon-testnet.stellar.org", { fetchImpl });

    expect(result.reachable).toBe(false);
    expect(result.error).toContain("500");
    expect(result.version).toBeNull();
  });

  it("treats a network failure as unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const result = await checkHorizon("https://horizon-testnet.stellar.org", { fetchImpl });

    expect(result.reachable).toBe(false);
    expect(result.error).toBe("fetch failed");
  });

  it("reports a timeout as unreachable", async () => {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    const fetchImpl = vi.fn().mockRejectedValue(timeout);

    const result = await checkHorizon("https://horizon-testnet.stellar.org", {
      timeoutMs: 100,
      fetchImpl,
    });

    expect(result.reachable).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("treats a 200 with non-JSON body as reachable (server is up)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html>up</html>", { status: 200 }));

    const result = await checkHorizon("https://horizon-testnet.stellar.org", { fetchImpl });

    expect(result.reachable).toBe(true);
    expect(result.version).toBeNull();
    expect(result.error).toBeNull();
  });

  it("normalizes trailing slashes on the probe URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ horizon_version: "2.34.0" }));

    await checkHorizon("https://horizon-testnet.stellar.org/", { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://horizon-testnet.stellar.org/",
      expect.anything()
    );
  });

  it("honors a custom timeout via AbortSignal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ horizon_version: "2.34.0" }));

    await checkHorizon("https://horizon-testnet.stellar.org", { timeoutMs: 123, fetchImpl });

    expect(timeoutSpy).toHaveBeenCalledWith(123);
    timeoutSpy.mockRestore();
  });
});
