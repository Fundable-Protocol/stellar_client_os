import { createCampaign, findDuplicateCampaigns, queryCampaigns } from "@/services/campaign.service";
import {
  detectLanguage,
  hasOnlySupportedTranslationLocales,
  isSupportedTranslationLocale,
} from "@/lib/translation";
import { listCreditListings, createCreditListing, purchaseCreditListing } from "@/services/carbon-credit-market.service";
import {
  detectLanguage,
  isSupportedTranslationLocale,
  localizeCampaign,
  localeFromAcceptLanguage,
  normalizeTranslationLocale,
  SUPPORTED_TRANSLATION_LOCALES,
  validateDescriptionTranslations,
  validateLocalizedContentMap,
} from "@/lib/translation";
import { withCampaignApiRateLimit } from "@/middlewares/rate-limit.middleware";

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
  const includeStats = url.searchParams.get("includeStats") === "true";
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const campaigns = await queryCampaigns({
    filter: { status: status || undefined, creator, search },
    sort: { field: (url.searchParams.get("sort") as never) || "createdAt", direction: url.searchParams.get("direction") === "asc" ? "ASC" : "DESC" },
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
    network: (url.searchParams.get("network") as "testnet" | "mainnet" | null) ?? undefined,
  });
  const responseCampaigns = requestedLanguage
    ? campaigns.map((campaign) => localizeCampaign(campaign, requestedLanguage))
    : campaigns;
  if (includeStats && creator) {
    const totalTrees = responseCampaigns.reduce((sum, campaign) => sum + (Number(campaign.treesPlanted) || 0), 0);
    const totalSponsors = responseCampaigns.reduce((sum, campaign) => sum + (Number(campaign.sponsorCount) || 0), 0);
    const totalCo2 = responseCampaigns.reduce((sum, campaign) => sum + (Number(campaign.co2Sequestered) || 0), 0);
    return Response.json({
      data: responseCampaigns,
      pagination: { limit, offset, count: responseCampaigns.length },
      stats: {
        totalCampaigns: campaigns.length,
        totalTrees,
        totalSponsors,
        totalCo2,
        profileUrl: `/creators/${encodeURIComponent(creator)}`,
      },
    });
  }
  return Response.json({ data: responseCampaigns, pagination: { limit, offset, count: responseCampaigns.length } });
}

async function postCampaign(request: Request) {
  try {
    const body = await request.json() as {
      creator?: string;
      creatorEmail?: string;
      name?: string;
      description?: string;
      location?: string;
      countries?: string[];
      region?: string;
      treeSpecies?: string;
      durationMs?: number;
      deadline?: number;
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
    if (body.autoTranslate) {
      return Response.json({ error: "Automatic translation is not configured; provide reviewed translations instead" }, { status: 501 });
    }
    if (!body.creator || !body.name || !body.goalAmount) {
      return Response.json({ error: "creator, name, and goalAmount are required" }, { status: 400 });
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
    if (body.region !== undefined && typeof body.region !== "string") {
      return Response.json({ error: "region must be a string" }, { status: 400 });
    }
    if (body.treeSpecies !== undefined && typeof body.treeSpecies !== "string") {
      return Response.json({ error: "treeSpecies must be a string" }, { status: 400 });
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
    let nonprofitPartner: { legalName: string; registrationNumber: string; country: string } | undefined;
    if (body.nonprofitPartner !== undefined) {
      const partner = body.nonprofitPartner;
      if (
        !partner ||
        typeof partner.legalName !== "string" || !partner.legalName.trim() ||
        typeof partner.registrationNumber !== "string" || !partner.registrationNumber.trim() ||
        typeof partner.country !== "string" || !partner.country.trim()
      ) {
        return Response.json(
          { error: "nonprofitPartner must include legalName, registrationNumber, and country" },
          { status: 400 },
        );
      }
      nonprofitPartner = {
        legalName: partner.legalName.trim(),
        registrationNumber: partner.registrationNumber.trim(),
        country: partner.country.trim(),
      };
    }
    if (body.deadline !== undefined && !Number.isFinite(body.deadline)) {
      return Response.json({ error: "deadline must be a numeric timestamp" }, { status: 400 });
    }
    const durationMs = body.durationMs ?? (body.deadline !== undefined ? body.deadline - Date.now() : undefined);
    if (durationMs !== undefined && durationMs < 0) {
      return Response.json({ error: "deadline must be in the future" }, { status: 400 });
    }
    const duplicates = await findDuplicateCampaigns({
      creator: body.creator,
      name: body.name,
      location: body.location,
      durationMs,
    });
    if (duplicates.length > 0) {
      return Response.json(
        { error: "A campaign with the same name, location, and duration already exists", duplicates },
        { status: 409 },
      );
    }

    const description = body.description ?? "";
    const language = body.language ?? detectLanguage(description);
    const translations = body.translations ?? {};
    // Language detection is metadata only; translations are supplied explicitly.
    const description = body.description ?? "";
    const language = body.language ? normalizeTranslationLocale(body.language)! : detectLanguage(description);

    const campaign = await createCampaign({
      creator: body.creator,
      creatorEmail: body.creatorEmail,
      name: body.name,
      description,
      location: body.location,
      countries: body.countries,
      region: body.region,
      treeSpecies: body.treeSpecies,
      durationMs,
      goalAmount: body.goalAmount,
      network: body.network,
      nonprofitPartner,
      language,
      translations: body.translations,
      localizedContent: body.localizedContent,
    });
    return Response.json(campaign, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}

async function getCreditListings(request: Request) {
  const url = new URL(request.url);
  const campaignId = url.searchParams.get("campaignId") ?? undefined;
  const seller = url.searchParams.get("seller") ?? undefined;
  const status = url.searchParams.get("status") as never;
  const listings = await listCreditListings({ campaignId, seller, status });
  return Response.json({ data: listings });
}

async function postCreditListing(request: Request) {
  try {
    const body = await request.json() as {
      campaignId?: string;
      seller?: string;
      amount?: string;
      pricePerCredit?: string;
      network?: "testnet" | "mainnet";
    };
    if (!body.campaignId || !body.seller || !body.amount || !body.pricePerCredit) {
      return Response.json(
        { error: "campaignId, seller, amount, and pricePerCredit are required" },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(body.amount) || !/^\d+$/.test(body.pricePerCredit)) {
      return Response.json(
        { error: "amount and pricePerCredit must be non-negative integer strings" },
        { status: 400 },
      );
    }
    const listing = await createCreditListing({
      campaignId: body.campaignId,
      seller: body.seller,
      amount: body.amount,
      pricePerCredit: body.pricePerCredit,
      network: body.network,
    });
    return Response.json(listing, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}

async function postCreditPurchase(request: Request) {
  try {
    const body = await request.json() as {
      listingId?: string;
      buyer?: string;
      amount?: string;
      network?: "testnet" | "mainnet";
    };
    if (!body.listingId || !body.buyer || !body.amount) {
      return Response.json(
        { error: "listingId, buyer, and amount are required" },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(body.amount)) {
      return Response.json({ error: "amount must be a non-negative integer string" }, { status: 400 });
    }
    const result = await purchaseCreditListing({
      listingId: body.listingId,
      buyer: body.buyer,
      amount: body.amount,
      network: body.network,
    });
    return Response.json(result, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}

export const GET = withCampaignApiRateLimit(getCampaigns);
export const POST = withCampaignApiRateLimit(postCampaign);
export const PUT = withCampaignApiRateLimit(postCreditListing);
export const PATCH = withCampaignApiRateLimit(postCreditPurchase);
export const OPTIONS = withCampaignApiRateLimit(getCreditListings);
