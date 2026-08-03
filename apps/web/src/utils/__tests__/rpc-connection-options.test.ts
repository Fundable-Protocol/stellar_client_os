import { describe, it, expect } from "vitest";
import { getStellarServerOptions } from "../rpc-connection-options";

describe("getStellarServerOptions", () => {
  it("should return allowHttp false for standard remote HTTPS URLs", () => {
    const options = getStellarServerOptions("https://soroban-testnet.stellar.org");
    expect(options.allowHttp).toBe(false);
    expect(options.headers).toBeUndefined();
  });

  it("should parse header in Key: Value format", () => {
    const options = getStellarServerOptions(
      "https://private-rpc.example.com",
      "Authorization: Bearer secret-token"
    );
    expect(options.headers).toEqual({ Authorization: "Bearer secret-token" });
  });

  it("should parse header in JSON format", () => {
    const options = getStellarServerOptions(
      "https://private-rpc.example.com",
      '{"Authorization": "Bearer json-token", "X-Custom-Header": "value"}'
    );
    expect(options.headers).toEqual({
      Authorization: "Bearer json-token",
      "X-Custom-Header": "value",
    });
  });

  it("should default to Authorization header if raw token string is provided", () => {
    const options = getStellarServerOptions(
      "https://private-rpc.example.com",
      "Bearer raw-token"
    );
    expect(options.headers).toEqual({ Authorization: "Bearer raw-token" });
  });

  it("should ignore empty rpcHeader string", () => {
    const options = getStellarServerOptions("https://soroban-testnet.stellar.org", "   ");
    expect(options.headers).toBeUndefined();
  });
});
