import { describe, expect, it, beforeEach, vi } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "../../../../services/campaign.service";
import { GET, PATCH } from "./route";

describe("GET /api/campaigns/:id freshness (#704)", () => {
  let dataSource: InMemoryCampaignDataSource;

  beforeEach(async () => {
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
    await createCampaign({ id: "fresh-campaign", creator: "creator", name: "Fresh", goalAmount: "1000" }, dataSource);
  });

  it("returns campaign status with no-store cache policy", async () => {
    const response = await GET(new Request("http://localhost/api/campaigns/fresh-campaign"), {
      params: Promise.resolve({ id: "fresh-campaign" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toMatchObject({ id: "fresh-campaign", sponsorCount: 0 });
  });

  it("accepts explicitly supplied translations for supported locales", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/campaigns/fresh-campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations: { ar: "عنوان الحملة" } }),
      }),
      { params: Promise.resolve({ id: "fresh-campaign" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      translations: { ar: "عنوان الحملة" },
    });
  });

  it("rejects unsupported locales and does not copy untranslated text", async () => {
    const unsupportedLocaleResponse = await PATCH(
      new Request("http://localhost/api/campaigns/fresh-campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translations: { xx: "Campaign title" } }),
      }),
      { params: Promise.resolve({ id: "fresh-campaign" }) },
    );
    expect(unsupportedLocaleResponse.status).toBe(400);

    const autoTranslateResponse = await PATCH(
      new Request("http://localhost/api/campaigns/fresh-campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoTranslate: true }),
      }),
      { params: Promise.resolve({ id: "fresh-campaign" }) },
    );
    expect(autoTranslateResponse.status).toBe(501);
  it("returns reviewed localized content when a supported language is requested", async () => {
    await createCampaign({
      id: "localized-campaign",
      creator: "creator",
      name: "Forest restoration",
      description: "Restore coastal forests",
      language: "en",
      goalAmount: "1000",
      localizedContent: { es: { title: "Restauración forestal", description: "Restaurar bosques costeros" } },
    }, dataSource);

    const response = await GET(new Request("http://localhost/api/campaigns/localized-campaign?language=es"), {
      params: Promise.resolve({ id: "localized-campaign" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Restauración forestal",
      description: "Restaurar bosques costeros",
      localization: { requestedLanguage: "es", resolvedLanguage: "es", isFallback: false },
    });
  });

  it("falls back to source content, negotiates Arabic, and rejects invalid explicit locales", async () => {
    const campaign = await createCampaign({
      id: "localized-campaign",
      creator: "creator",
      name: "Forest restoration",
      description: "Restore coastal forests",
      language: "en",
      goalAmount: "1000",
      localizedContent: { ar: { title: "استعادة الغابات" } },
    }, dataSource);

    const fallback = await GET(new Request("http://localhost/api/campaigns/localized-campaign?language=fr"), {
      params: Promise.resolve({ id: campaign.id }),
    });
    expect(await fallback.json()).toMatchObject({
      name: "Forest restoration",
      localization: { resolvedLanguage: "en", isFallback: true },
    });

    const arabic = await GET(new Request("http://localhost/api/campaigns/localized-campaign", {
      headers: { "Accept-Language": "ar" },
    }), { params: Promise.resolve({ id: campaign.id }) });
    expect(await arabic.json()).toMatchObject({
      name: "استعادة الغابات",
      localization: { direction: "rtl", isFallback: true },
    });

    const invalid = await GET(new Request("http://localhost/api/campaigns/localized-campaign?language=xx"), {
      params: Promise.resolve({ id: campaign.id }),
    });
    expect(invalid.status).toBe(400);
  });
});

describe("PATCH /api/campaigns/:id impact milestones", () => {
  const dispatch = vi.fn<(event: string, payload: Record<string, unknown>) => Promise<void>>().mockResolvedValue(undefined);
  let dataSource: InMemoryCampaignDataSource;
  const context = { params: Promise.resolve({ id: "impact-campaign" }) };
  const request = (body: unknown) => new Request("http://localhost/api/campaigns/impact-campaign", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  beforeEach(async () => {
    dispatch.mockClear();
    dataSource = new InMemoryCampaignDataSource(dispatch);
    setCampaignDataSource(dataSource);
    await createCampaign({ id: "impact-campaign", creator: "creator", name: "Forest", goalAmount: "1000" }, dataSource);
  });

  it("updates impact totals and emits each reached event once", async () => {
    const first = await PATCH(request({ treeCount: 1000, co2Sequestration: "9.5" }), context);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ treeCount: 1000, co2Sequestration: "9.5" });

    const second = await PATCH(request({ treeCount: 5000, co2Sequestration: "10" }), context);
    expect(second.status).toBe(200);
    await PATCH(request({ treeCount: 5000, co2Sequestration: "10" }), context);
    expect(dispatch.mock.calls.map(([, payload]) => payload.milestone)).toEqual([
      "1000_trees", "5000_trees", "10_tons_co2",
    ]);
  });

  it("rejects invalid impact totals without saving or dispatching", async () => {
    expect((await PATCH(request({ treeCount: -1 }), context)).status).toBe(400);
    expect((await PATCH(request({ treeCount: 1.5 }), context)).status).toBe(400);
    expect((await PATCH(request({ co2Sequestration: "Infinity" }), context)).status).toBe(400);
    expect((await dataSource.getCampaigns())[0].treeCount).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("accepts explicit localized content and rejects unsupported languages without mutation", async () => {
    const updated = await PATCH(request({ localizedContent: { zh: { title: "海岸森林恢复" } } }), context);
    expect(updated.status).toBe(200);
    expect((await dataSource.getCampaigns())[0].localizedContent?.zh?.title).toBe("海岸森林恢复");

    const invalid = await PATCH(request({ language: "xx" }), context);
    expect(invalid.status).toBe(400);
    expect((await dataSource.getCampaigns())[0].language).toBe("en");
  });
});
