import { describe, it, expect } from "vitest";
import {
  createPresignedPutUrl,
  awsUriEncode,
  buildEvidenceKey,
  extensionForContentType,
} from "./index";
import { loadS3Config, s3ConfigSchema } from "./config";
import type { S3Config } from "./config";

const FIXED_NOW = 1_700_000_000; // deterministic "now" for stable signatures

function testConfig(overrides: Partial<S3Config> = {}): S3Config {
  return {
    AWS_REGION: "us-east-1",
    AWS_S3_BUCKET: "fundable-evidence",
    AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
    AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    S3_PRESIGN_EXPIRES_SECONDS: 300,
    ...overrides,
  };
}

describe("awsUriEncode", () => {
  it("preserves unreserved characters", () => {
    expect(awsUriEncode("abcXYZ012-._~")).toBe("abcXYZ012-._~");
  });

  it("upper-hex encodes reserved characters", () => {
    expect(awsUriEncode("a b+c")).toBe("a%20b%2Bc");
  });

  it("keeps slashes unencoded by default", () => {
    expect(awsUriEncode("evidence/1/2")).toBe("evidence/1/2");
  });
});

describe("createPresignedPutUrl", () => {
  it("produces a signed PUT url with expected query parameters", () => {
    const result = createPresignedPutUrl(
      testConfig(),
      { key: "evidence/42/1/uuid.jpg", contentType: "image/jpeg" },
      FIXED_NOW,
    );

    const url = new URL(result.url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("fundable-evidence.s3.us-east-1.amazonaws.com");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Credential")).toContain(
      "AKIAIOSFODNN7EXAMPLE/",
    );
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the object key, content type and expiry metadata", () => {
    const result = createPresignedPutUrl(
      testConfig(),
      { key: "evidence/42/1/uuid.jpg", contentType: "image/png" },
      FIXED_NOW,
    );
    expect(result.key).toBe("evidence/42/1/uuid.jpg");
    expect(result.contentType).toBe("image/png");
    expect(result.expiresAt).toBe(FIXED_NOW + 300);
    expect(result.requestId).toBeTruthy();
  });

  it("signature changes when the key changes (request is bound to the key)", () => {
    const base = testConfig();
    const a = createPresignedPutUrl(
      base,
      { key: "evidence/1/1/a.jpg", contentType: "image/jpeg" },
      FIXED_NOW,
    );
    const b = createPresignedPutUrl(
      base,
      { key: "evidence/1/1/b.jpg", contentType: "image/jpeg" },
      FIXED_NOW,
    );
    expect(a.url).not.toBe(b.url);
  });

  it("signature changes when the secret changes", () => {
    const a = createPresignedPutUrl(
      testConfig(),
      { key: "evidence/1/1/a.jpg", contentType: "image/jpeg" },
      FIXED_NOW,
    );
    const b = createPresignedPutUrl(
      testConfig({ AWS_SECRET_ACCESS_KEY: "different-secret-key-value" }),
      { key: "evidence/1/1/a.jpg", contentType: "image/jpeg" },
      FIXED_NOW,
    );
    expect(a.url).not.toBe(b.url);
  });

  it("includes the session token when temporary credentials are configured", () => {
    const result = createPresignedPutUrl(
      testConfig({ AWS_SESSION_TOKEN: "FwoGZXIvYXdzEF0EXAMPLE" }),
      { key: "evidence/1/1/a.jpg", contentType: "image/jpeg" },
      FIXED_NOW,
    );
    const url = new URL(result.url);
    expect(url.searchParams.get("X-Amz-Security-Token")).toBe(
      "FwoGZXIvYXdzEF0EXAMPLE",
    );
  });

  it("clamps a requested lifetime to the configured maximum", () => {
    const config = testConfig({ S3_PRESIGN_EXPIRES_SECONDS: 300 });
    const result = createPresignedPutUrl(
      config,
      { key: "evidence/1/1/a.jpg", contentType: "image/jpeg", expiresInSeconds: 3600 },
      FIXED_NOW,
    );
    const url = new URL(result.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(result.expiresAt).toBe(FIXED_NOW + 300);
  });

  it("honours the configured default lifetime", () => {
    const result = createPresignedPutUrl(
      testConfig({ S3_PRESIGN_EXPIRES_SECONDS: 600 }),
      { key: "evidence/1/1/a.jpg", contentType: "image/jpeg" },
      FIXED_NOW,
    );
    const url = new URL(result.url);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
  });
});

describe("buildEvidenceKey", () => {
  it("namespaces the key under evidence/<campaign>/<milestone>", () => {
    const key = buildEvidenceKey("42", "1", "image/jpeg");
    expect(key).toMatch(/^evidence\/42\/1\/[0-9a-f-]{36}\.jpg$/);
  });

  it("uses the correct extension per content type", () => {
    expect(extensionForContentType("image/png")).toBe("png");
    expect(extensionForContentType("application/pdf")).toBe("pdf");
    expect(buildEvidenceKey("42", "1", "image/webp")).toMatch(/\.webp$/);
  });

  it("sanitizes directory-traversal characters in ids", () => {
    const key = buildEvidenceKey("../etc", "1", "image/jpeg");
    expect(key).toMatch(/^evidence\/etc\/1\//);
    expect(key).not.toContain("..");
  });
});

describe("loadS3Config", () => {
  it("parses a complete valid environment", () => {
    const config = loadS3Config({
      AWS_REGION: "eu-west-1",
      AWS_S3_BUCKET: "bucket",
      AWS_ACCESS_KEY_ID: "AKIA123",
      AWS_SECRET_ACCESS_KEY: "secret",
    } as NodeJS.ProcessEnv);
    expect(config.AWS_REGION).toBe("eu-west-1");
    expect(config.S3_PRESIGN_EXPIRES_SECONDS).toBe(300);
  });

  it("throws when required variables are missing", () => {
    expect(() =>
      loadS3Config({ AWS_REGION: "us-east-1" } as NodeJS.ProcessEnv),
    ).toThrow(/AWS_S3_BUCKET/);
  });

  it("rejects an out-of-range expiry at the schema level", () => {
    const result = s3ConfigSchema.safeParse({
      AWS_REGION: "us-east-1",
      AWS_S3_BUCKET: "bucket",
      AWS_ACCESS_KEY_ID: "AKIA123",
      AWS_SECRET_ACCESS_KEY: "secret",
      S3_PRESIGN_EXPIRES_SECONDS: "9999",
    });
    expect(result.success).toBe(false);
  });
});
