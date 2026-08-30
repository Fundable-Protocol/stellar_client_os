import { afterEach, describe, expect, it, vi } from "vitest";
import { reportCaughtError, reportRuntimeError } from "./error-reporting";

const { captureException, setContext } = vi.hoisted(() => ({
  captureException: vi.fn(),
  setContext: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException,
  withScope: (callback: (scope: { setContext: typeof setContext }) => void) =>
    callback({ setContext }),
}));

describe("error reporting", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("captures a sanitized runtime error in Sentry", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://example@sentry.invalid/1");

    const publicKey = `G${"A".repeat(55)}`;
    reportRuntimeError(new Error(`Wallet lookup failed for ${publicKey}`), {
      boundaryName: "root-layout",
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [captured] = captureException.mock.calls[0] as [Error];
    expect(captured.message).not.toContain(publicKey);
    expect(captured.message).toContain("GAAA...AAAAA");
    expect(setContext).toHaveBeenCalledWith("fundable", {
      boundaryName: "root-layout",
      componentStack: undefined,
    });
  });

  it("captures caught errors without replacing the custom fallback contract", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://example@sentry.invalid/1");

    reportCaughtError(new Error("Request failed"), { route: "/api/streams" });

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Request failed" })
    );
    expect(setContext).toHaveBeenCalledWith("fundable", { route: "/api/streams" });
  });

  it("does not call Sentry when no DSN is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    reportCaughtError(new Error("No DSN"));

    expect(captureException).not.toHaveBeenCalled();
  });
});
