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
  const campaigns = await queryCampaigns({
    filter: { status: status || undefined, creator, search, isStaffPick },
    sort: { field: (url.searchParams.get("sort") as never) || "createdAt", direction: url.searchParams.get("direction") === "asc" ? "ASC" : "DESC" },
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
    network: (url.searchParams.get("network") as "testnet" | "mainnet" | null) ?? undefined,
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

    // Language detection and auto-translation
    const description = body.description ?? "";
    const language = body.language ? normalizeTranslationLocale(body.language)! : detectLanguage(description);
    let translations = body.translations ?? {};
    if (body.autoTranslate) {
      translations = {
        ...autoTranslate(description, SUPPORTED_TRANSLATION_LOCALES),
        ...translations,
      };
    }

    // Campaign insurance pool: 1% of goal funds allocated to protect against tree loss within 2 years.
    const goalAmountBigInt = BigInt(body.goalAmount);
    const insurancePoolAmount = (goalAmountBigInt / 100n).toString();
    const insurancePool = {
      amount: insurancePoolAmount,
      contributionRate: 0.01,
      coverageWindowMs: 2 * 365 * 24 * 60 * 60 * 1000,
      claimedAmount: "0",
      status: "active" as const,
    };

    const campaign = await createCampaign({
      creator: body.creator,
      creatorEmail: body.creatorEmail,
      pledgeThankYouGreeting: body.pledgeThankYouGreeting,
      pledgeThankYouBody: body.pledgeThankYouBody,
      name: body.name,
      description,
      location: body.location,
      countries: body.countries,
      speciesTags: body.speciesTags,
      region: body.region,
      treeSpecies: body.treeSpecies,
      gpsLocations: body.gpsLocations,
      underrepresentedTags: body.underrepresentedTags,
      durationMs,
      goalAmount: body.goalAmount,
      network: body.network,
      deadline: body.deadline,
      countdownEnabled: body.countdownEnabled === true,
      nonprofitPartner,
      language,
      translations,
      localizedContent: body.localizedContent,
      insurancePool,
    });

    // Automated AI fraud detection review on campaign publish
    const fraudReview = await fraudDetectionService.reviewCampaignListing({
      id: campaign.id,
      title: campaign.name,
      creatorAddress: campaign.creator,
      description: campaign.description,
      goalAmount: campaign.goalAmount,
      treeCount: campaign.treeCount,
      durationDays: campaign.durationMs ? Math.round(campaign.durationMs / 86_400_000) : undefined,
      location: campaign.location,
      submittedLocation: body.gpsLocations?.[0] ? { latitude: body.gpsLocations[0].latitude, longitude: body.gpsLocations[0].longitude } : undefined,
    });

    return Response.json(
      {
        ...campaign,
        fraudReview: {
          action: fraudReview.action,
          riskScore: fraudReview.report.overallRiskScore,
          riskLevel: fraudReview.report.riskLevel,
          recommendation: fraudReview.report.recommendation,
          reviewStatus: fraudReview.reviewItem ? fraudReview.reviewItem.status : 'PASSED',
        },
      },
      { status: 201 }
    );
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
