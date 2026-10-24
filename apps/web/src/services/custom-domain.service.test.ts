import { beforeEach, describe, expect, it } from "vitest";
import { clearCustomDomainState, configureCreatorCustomDomain, getCreatorCustomDomain, normalizeCustomSubdomain } from "./custom-domain.service";

describe("custom domain service", () => {
  beforeEach(() => clearCustomDomainState());
  it("provisions SSL and a canonical URL for a valid domain", () => {
    const domain = configureCreatorCustomDomain("GCREATOR", "https://campaigns.example.com/", 100);
    expect(domain).toMatchObject({ domain: "campaigns.example.com", canonicalUrl: "https://campaigns.example.com", ssl: "PROVISIONED", status: "ACTIVE" });
    expect(getCreatorCustomDomain("gcreator")?.verificationToken).toContain("fundable-site-verification=");
  });
  it("rejects invalid and reserved domains", () => {
    expect(() => normalizeCustomSubdomain("not a domain")).toThrow(/valid subdomain/);
    expect(() => normalizeCustomSubdomain("api.example.com")).toThrow(/reserved/);
  });
});
