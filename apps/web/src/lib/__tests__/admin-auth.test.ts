import { describe, expect, it } from "vitest";
import { authorizeAdminRequest } from "../admin-auth";

const KEY = "s3cret-admin-key";
const env = { ADMIN_API_KEY: KEY };
const request = (authorization?: string) =>
  new Request("http://test/api/admin", {
    headers: authorization ? { authorization } : {},
  });

describe("authorizeAdminRequest", () => {
  it("lets a request with the admin key through", () => {
    expect(authorizeAdminRequest(request(`Bearer ${KEY}`), env)).toBeNull();
    expect(authorizeAdminRequest(request(`bearer   ${KEY} `), env)).toBeNull();
  });

  it.each([
    ["no header", undefined],
    ["the wrong key", "Bearer nope"],
    ["a prefix of the key", `Bearer ${KEY.slice(0, 4)}`],
    ["another scheme", `Basic ${KEY}`],
  ])("rejects %s with a 401", async (_label, header) => {
    const response = authorizeAdminRequest(request(header), env);

    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain("Bearer");
    expect(await response?.json()).toEqual({ error: "Admin authorization required" });
  });

  it("fails closed with a 503 when no key is configured", () => {
    expect(authorizeAdminRequest(request(`Bearer ${KEY}`), {})?.status).toBe(503);
    expect(authorizeAdminRequest(request("Bearer "), { ADMIN_API_KEY: "  " })?.status).toBe(503);
  });
});
