import { describe, expect, it } from "vitest";
import {
  buildAppleAppSiteAssociation,
  buildAssetLinks,
  detectMobilePlatform,
  getDeepLinkConfig,
  toAppUrl,
} from "./deep-links";

const config = getDeepLinkConfig({
  NEXT_PUBLIC_IOS_TEAM_ID: "TEAM123",
  NEXT_PUBLIC_IOS_BUNDLE_ID: "com.example.app",
  NEXT_PUBLIC_ANDROID_PACKAGE: "com.example.app",
  ANDROID_CERT_SHA256_FINGERPRINTS: "AA:BB, CC:DD",
});

describe("toAppUrl", () => {
  it("maps campaign detail pages", () => {
    expect(toAppUrl("/campaigns/42")).toBe("fundable://campaigns/42");
    expect(toAppUrl("/campaigns/42", "?ref=x")).toBe("fundable://campaigns/42?ref=x");
  });
  it("maps backer and creator dashboards", () => {
    expect(toAppUrl("/dashboard")).toBe("fundable://dashboard");
    expect(toAppUrl("/creators/GABC")).toBe("fundable://creators/GABC");
  });
  it("ignores non deep-linkable routes", () => {
    expect(toAppUrl("/campaigns/create")).toBeNull();
    expect(toAppUrl("/campaigns")).toBeNull();
    expect(toAppUrl("/history")).toBeNull();
  });
});

describe("association documents", () => {
  it("builds AASA with app id and paths", () => {
    const doc = buildAppleAppSiteAssociation(config);
    expect(doc.applinks.details[0].appIDs).toEqual(["TEAM123.com.example.app"]);
    expect(doc.applinks.details[0].components).toContainEqual({ "/": "/campaigns/*" });
  });
  it("builds assetlinks with fingerprints", () => {
    const [entry] = buildAssetLinks(config);
    expect(entry.target.package_name).toBe("com.example.app");
    expect(entry.target.sha256_cert_fingerprints).toEqual(["AA:BB", "CC:DD"]);
  });
});

describe("detectMobilePlatform", () => {
  it("detects platforms", () => {
    expect(detectMobilePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(detectMobilePlatform("Mozilla/5.0 (Linux; Android 14)")).toBe("android");
    expect(detectMobilePlatform("Mozilla/5.0 (Windows NT 10.0)")).toBeNull();
  });
});
