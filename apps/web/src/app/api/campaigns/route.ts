import { createCampaign, findDuplicateCampaigns, queryCampaigns } from "@/services/campaign.service";
import { fraudDetectionService } from "@/services/fraud-detection.service";
import {
  autoTranslate,
  detectLanguage,
  hasOnlySupportedTranslationLocales,
  isSupportedTranslationLocale,
  localizeCampaign,
  localeFromAcceptLanguage,
  normalizeTranslationLocale,
  SUPPORTED_TRANSLATION_LOCALES,
  validateDescriptionTranslations,
  validateLocalizedContentMap,
} from "@/lib/translation";
import { listCreditListings, createCreditListing, purchaseCreditListing } from "@/services/carbon-credit-market.service";
import { withCampaignApiRateLimit } from "@/middlewares/rate-limit.middleware";
import { UNDERREPRESENTED_CRITERIA } from "@/services/grant-program.service";
import { getLiveStreamStatusForCampaigns } from "@/services/stream-status.service";
import type { LiveStreamStatus } from "@/lib/live-stream";
import { hybridCampaignSearch, parseSearchFilters } from "@/services/campaign-search.service";

export const runtime = "nodejs";

async function getCampaigns(request: Request) {
  const url = new URL(request.url);
  const hasLanguageParameter = url.searchParams.has("language");
  const requestedLanguage = hasLanguageParameter
    ? normalizeTranslationLocale(url.searchParams.get("language") ?? "")
    : localeFromAcceptLanguage(request.headers.get("accept-language"));
  if (hasLanguageParameter && !requestedLanguage) {
    return Response.json({ error: "Unsupported or invalid language code", supportedLanguages: SUPPORTED_TRANSLATION_LOCALES }, { status: 400 });
  }
  const status = url.searchParams.get("status") as never;
  const creator = url.searchParams.get("creator") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const isStaffPick = url.searchParams.has("isStaffPick") ? url.searchParams.get("isStaffPick") === "true" : undefined;
  const includeStats = url.searchParams.get("includeStats") === "true";
  const includeStreamStatus = url.searchParams.get("includeStreamStatus") === "true";
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const network = (url.searchParams.get("network") as "testnet" | "mainnet" | null) ?? undefined;
  const safeLimit = Number.isFinite(limit) ? limit : 20;
  const safeOffset = Number.isFinite(offset) ? offset : 0;

  // Semantic / hybrid search (issue: vector embeddings + tag filters).
  // Activated when a free-text query is supplied; combines keyword match with
  // embedding similarity and applies interactive facet filters.
  const semanticMode = url.searchParams.get("mode") === "semantic" || (!!search && url.searchParams.get("mode") !== "keyword");
  if (semanticMode && search) {
    const filters = parseSearchFilters(url.searchParams);
    const results = await hybridCampaignSearch({
      query: search,
      filters,
      limit: safeLimit,
      offset: safeOffset,
      network,
    });
    const localized = requestedLanguage
      ? results.map((campaign) => localizeCampaign(campaign, requestedLanguage))
      : results;
    return Response.json({ data: localized, pagination: { limit: safeLimit, offset: safeOffset, count: localized.length }, search: { mode: "hybrid", query: search } });
  }

  const campaigns = await queryCampaigns({
    filter: { status: status || undefined, creator, search, isStaffPick },
    sort: { field: (url.searchParams.get("sort") as never) || "createdAt", direction: url.searchParams.get("direction") === "asc" ? "ASC" : "DESC" },
    limit: safeLimit,
    offset: safeOffset,
    network,
  });
  const responseCampaigns = requestedLanguage
    ? campaigns.map((campaign) => localizeCampaign(campaign, requestedLanguage))
    : campaigns;
  // Provider-backed live status for campaign cards (issue #1225). Opt-in so
  // existing consumers keep their response shape; only campaigns with a
  // configured stream hit a provider, and results are cached server-side.
  let displayCampaigns: Array<
    (typeof responseCampaigns)[number] & { streamStatus?: LiveStreamStatus; streamStatusCheckedAt?: number }
  > = responseCampaigns;
  if (includeStreamStatus) {
    const statuses = await getLiveStreamStatusForCampaigns(campaigns);
    displayCampaigns = responseCampaigns.map((campaign) => {
      const status = statuses.get(campaign.id);
      return status
        ? { ...campaign, streamStatus: status.status, streamStatusCheckedAt: status.checkedAt }
        : campaign;
    });
  }
  if (includeStats && creator) {
    const totalTrees = displayCampaigns.reduce((sum, campaign) => sum + (Number(campaign.treesPlanted) || 0), 0);
    const totalSponsors = displayCampaigns.reduce((sum, campaign) => sum + (Number(campaign.sponsorCount) || 0), 0);
    const totalCo2 = displayCampaigns.reduce((sum, campaign) => sum + (Number(campaign.co2Sequestered) || 0), 0);
    const diverseCampaigns = displayCampaigns.filter((campaign) => campaign.geographicDiversity?.bonusApplied).length;
    return Response.json({
      data: displayCampaigns,
      pagination: { limit, offset, count: displayCampaigns.length },
      stats: {
        totalCampaigns: campaigns.length,
        totalTrees,
        totalSponsors,
        totalCo2,
        diverseCampaigns,
        profileUrl: `/creators/${encodeURIComponent(creator)}`,
      },
    });
  }
  return Response.json({ data: displayCampaigns, pagination: { limit, offset, count: displayCampaigns.length } });
}

async function postCampaign(request: Request) {
  try {
    const body = await request.json() as {
      creator?: string;
      creatorEmail?: string;
      pledgeThankYouGreeting?: string;
      pledgeThankYouBody?: string;
      name?: string;
      description?: string;
      risksAndChallenges?: string;
      location?: string;
      countries?: string[];
      speciesTags?: string[];
      region?: string;
      treeSpecies?: string;
      /** GPS coordinates of the planting site(s), validated and stored for the
       * global planting-locations map (campaign geolocation, v1). */
      gpsLocations?: Array<{ latitude: number; longitude: number }>;
      /** Underrepresented-community tags qualifying the campaign for the
       * platform's first-10% grant matching programs. */
      underrepresentedTags?: string[];
      durationMs?: number;
      deadline?: number;
      countdownEnabled?: boolean;
      goalAmount?: string;
      network?: "testnet" | "mainnet";
      language?: string;
      translations?: Record<string, string>;
      localizedContent?: Record<string, { name?: string; title?: string; description?: string; location?: string; treeSpecies?: string; region?: string }>;
      autoTranslate?: boolean;
      nonprofitPartner?: {
        legalName?: unknown;
        registrationNumber?: unknown;
        country?: unknown;
      };
    };
    if (!body.creator || !body.name || !body.goalAmount) {
      return Response.json({ error: "creator, name, and goalAmount are required" }, { status: 400 });
    }
    if (
      typeof body.risksAndChallenges !== "string" ||
      body.risksAndChallenges.trim().length < 20 ||
      body.risksAndChallenges.length > 10000
    ) {
      return Response.json(
        { error: "risksAndChallenges must contain at least 20 characters and no more than 10,000 characters" },
        { status: 400 },
      );
    }
    if (body.pledgeThankYouGreeting !== undefined && (typeof body.pledgeThankYouGreeting !== "string" || body.pledgeThankYouGreeting.length > 240)) {
      return Response.json({ error: "pledgeThankYouGreeting must be 240 characters or fewer" }, { status: 400 });
    }
    if (body.pledgeThankYouBody !== undefined && (typeof body.pledgeThankYouBody !== "string" || body.pledgeThankYouBody.length > 2000)) {
      return Response.json({ error: "pledgeThankYouBody must be 2,000 characters or fewer" }, { status: 400 });
    }
    if (!/^\d+$/.test(body.goalAmount)) {
      return Response.json({ error: "goalAmount must be a non-negative integer string" }, { status: 400 });
    }
    if (body.location !== undefined && typeof body.location !== "string") {
      return Response.json({ error: "location must be a string" }, { status: 400 });
    }
    if (body.language !== undefined && !isSupportedTranslationLocale(body.language)) {
      return Response.json({ error: "language must be a supported ISO 639-1 code", supportedLanguages: SUPPORTED_TRANSLATION_LOCALES }, { status: 400 });
    }
    if (body.translations !== undefined && !validateDescriptionTranslations(body.translations)) {
      return Response.json({ error: "translations must map supported language codes to non-empty descriptions" }, { status: 400 });
    }
    if (body.localizedContent !== undefined && !validateLocalizedContentMap(body.localizedContent)) {
      return Response.json({ error: "localizedContent must map supported language codes to non-empty campaign fields" }, { status: 400 });
    }
    if (body.countries !== undefined && (!Array.isArray(body.countries) || body.countries.some((c) => typeof c !== "string"))) {
      return Response.json({ error: "countries must be an array of strings" }, { status: 400 });
    }
    if (body.speciesTags !== undefined && (!Array.isArray(body.speciesTags) || body.speciesTags.some((tag) => typeof tag !== "string"))) {
      return Response.json({ error: "speciesTags must be an array of strings" }, { status: 400 });
    }
    if (body.region !== undefined && typeof body.region !== "string") {
      return Response.json({ error: "region must be a string" }, { status: 400 });
    }
    if (body.treeSpecies !== undefined && typeof body.treeSpecies !== "string") {
      return Response.json({ error: "treeSpecies must be a string" }, { status: 400 });
    }
    if (body.gpsLocations !== undefined) {
      if (
        !Array.isArray(body.gpsLocations) ||
        body.gpsLocations.some(
          (point) =>
            !point ||
            typeof point.latitude !== "number" ||
            !Number.isFinite(point.latitude) ||
            point.latitude < -90 ||
            point.latitude > 90 ||
            typeof point.longitude !== "number" ||
            !Number.isFinite(point.longitude) ||
            point.longitude < -180 ||
            point.longitude > 180,
        )
      ) {
        return Response.json(
          { error: "gpsLocations must be an array of { latitude, longitude } coordinates within range" },
          { status: 400 },
        );
      }
    }
    if (body.underrepresentedTags !== undefined) {
      if (
        !Array.isArray(body.underrepresentedTags) ||
        body.underrepresentedTags.some(
          (tag) => typeof tag !== "string" || !(UNDERREPRESENTED_CRITERIA as readonly string[]).includes(tag),
        )
      ) {
        return Response.json(
          { error: "underrepresentedTags must be an array of valid grant eligibility criteria" },
          { status: 400 },
        );
      }
    }
    if (body.durationMs !== undefined && (!Number.isFinite(body.durationMs) || body.durationMs < 0)) {
      return Response.json({ error: "durationMs must be a non-negative number" }, { status: 400 });
    }
    if (body.language && !isSupportedTranslationLocale(body.language)) {
      return Response.json({ error: "language is not supported" }, { status: 400 });
    }
    if (body.translations && !hasOnlySupportedTranslationLocales(body.translations)) {
      return Response.json({ error: "translations contain an unsupported language" }, { status: 400 });
    }
    if (body.autoTranslate) {
      return Response.json(
        { error: "Automatic translation is unavailable. Provide translations for the supported languages." },
        { status: 501 },
      );
    }
    let nonprofitPartner: { legalName: string; registrationNumber: string; country: string } | undefined;
    if (body.nonprofitPartner !== undefined) {
      const partner = body.nonprofitPartner;
      if (
        !partner ||
        typeof partner.legalName !== "string"
      ) {
        return Response.json({ error: "nonprofitPartner.legalName must be a string" }, { status: 400 });
      }
      nonprofitPartner = {
        legalName: partner.legalName,
        registrationNumber: String(partner.registrationNumber ?? ""),
        country: String(partner.country ?? ""),
      };
    }
    return Response.json({ data: { ...body, nonprofitPartner } }, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}
