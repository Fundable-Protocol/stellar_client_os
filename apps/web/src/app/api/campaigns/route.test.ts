import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";

vi.mock("@/middlewares/rate-limit.middleware", () => ({
  withCampaignApiRateLimit: (handler: (...args: any[]) => unknown) => handler,
}));

import { GET, POST } from "./route";

const post = (body: unknown) => new Request("http://localhost/api/campaigns", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  setCampaignDataSource(new InMemoryCampaignDataSource());
});

describe("campaign collection localization", () => {
  it("preserves the default collection response and localizes on request", async () => {
    const created = await POST(post({
      creator: "creator-1",
      name: "Coastal forest",
      description: "Restore coastal forests",
      language: "en",
      goalAmount: "1000",
      localizedContent: { pt: { title: "Floresta costeira", description: "Restaurar florestas costeiras" } },
    }));
    expect(created.status).toBe(201);
    const stored = await created.json();

    const defaultResponse = await GET(new Request("http://localhost/api/campaigns"));
    const defaultBody = await defaultResponse.json();
    expect(defaultBody.data[0]).toMatchObject({ id: stored.id, name: "Coastal forest", description: "Restore coastal forests" });
    expect(defaultBody.data[0]).not.toHaveProperty("localization");

    const localizedResponse = await GET(new Request("http://localhost/api/campaigns?language=pt-BR"));
    expect(localizedResponse.status).toBe(200);
    expect((await localizedResponse.json()).data[0]).toMatchObject({
      name: "Floresta costeira",
      description: "Restaurar florestas costeiras",
      localization: { requestedLanguage: "pt", isFallback: false },
    });
  });

  it("validates explicit language codes and does not claim automatic translation", async () => {
    const unsupportedLanguage = await POST(post({ creator: "creator", name: "Campaign", goalAmount: "100", language: "xx" }));
    expect(unsupportedLanguage.status).toBe(400);

    const invalidLocalizedContent = await POST(post({
      creator: "creator",
      name: "Campaign",
      goalAmount: "100",
      localizedContent: { xx: { title: "No translation" } },
    }));
    expect(invalidLocalizedContent.status).toBe(400);

    const autoTranslate = await POST(post({
      creator: "creator",
      name: "Campaign",
      goalAmount: "100",
      autoTranslate: true,
    }));
    expect(autoTranslate.status).toBe(501);
    expect((await autoTranslate.json()).error).toContain("not configured");
  });

  it("returns a clear error for unsupported requested response languages", async () => {
    const response = await GET(new Request("http://localhost/api/campaigns?language=not-a-locale"));
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("supportedLanguages");
  });
});
