import { createHmac, randomUUID } from "crypto";
import {
  getCampaign,
  queryCampaigns,
  type CampaignRecord,
} from "./campaign.service";
import {
  buildEmbedSnippet,
  DEFAULT_WIDGET_THEME,
  progressPercent,
  resolveWidgetTheme,
  WIDGET_IFRAME_MIN_HEIGHT,
  WIDGET_THEMES,
  widgetIframeSrc,
  type WidgetTheme,
} from "@/lib/widget-theme";
import { calculateCo2Offset } from "@/lib/co2-impact";
import type {
  OAuth2AuthorizationCodeRecord,
  OAuth2ClientRecord,
  OAuth2GrantType,
  OAuth2TokenRecord,
  OAuth2TokenResponse,
  PublicApiEndpointDoc,
  PublicApiEnvironment,
  PublicApiQuotaStatus,
  PublicApiQuotaWindow,
  PublicApiScope,
  PublicApiTier,
  PublicApiTierQuotaConfig,
  PublicCampaignDto,
  PublicWebhookDeliveryRecord,
  PublicWebhookEventType,
  PublicWebhookSubscriptionRecord,
  PublicWidgetEmbedDto,
} from "@/types/public-api";

export const PUBLIC_API_SCOPES: readonly PublicApiScope[] = [
  "campaigns:read",
  "widgets:embed",
  "webhooks:manage",
] as const;

export const PUBLIC_WEBHOOK_EVENTS: readonly PublicWebhookEventType[] = [
  "campaign.created",
  "campaign.donation_received",
  "campaign.milestone_reached",
  "campaign.completed",
  "tree_verified",
  "batch_verified",
] as const;

export const PUBLIC_API_TIER_QUOTAS: Record<
  PublicApiTier,
  PublicApiTierQuotaConfig
> = {
  free: {
    id: "free",
    name: "Developer Free Tier",
    hourlyLimit: 100,
    dailyLimit: 1_000,
    burstPerMinute: 20,
    description:
      "100 req/hr & 1,000 req/day — Ideal for sandbox prototyping and personal integrations",
  },
  pro: {
    id: "pro",
    name: "Growth Pro Tier",
    hourlyLimit: 1_000,
    dailyLimit: 25_000,
    burstPerMinute: 120,
    description:
      "1,000 req/hr & 25,000 req/day — Designed for partner platforms, widgets, and active webhooks",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise Institutional Tier",
    hourlyLimit: 10_000,
    dailyLimit: 250_000,
    burstPerMinute: 600,
    description:
      "10,000 req/hr & 250,000 req/day — High-throughput dedicated quota for global ESG & registry partners",
  },
};

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const ACCESS_TOKEN_TTL_SECONDS = 3_600;
const AUTH_CODE_TTL_MS = 10 * 60 * 1_000;

export const DEFAULT_SANDBOX_CLIENT: OAuth2ClientRecord = {
  clientId: "fnd_sbx_client_demo",
  clientSecret: "fnd_sbx_secret_demo_2026",
  name: "Fundable Sandbox Explorer App",
  description:
    "Pre-provisioned OAuth2 sandbox client for testing campaign reads, widget embeds, and webhook events.",
  redirectUris: ["https://localhost:3000/oauth/callback", "https://sandbox.fundable.network/callback"],
  scopes: ["campaigns:read", "widgets:embed", "webhooks:manage"],
  environment: "sandbox",
  tier: "pro",
  createdAt: "2026-01-01T00:00:00.000Z",
};

export const DEFAULT_PRODUCTION_CLIENT: OAuth2ClientRecord = {
  clientId: "fnd_live_client_demo",
  clientSecret: "fnd_live_secret_demo_2026",
  name: "Fundable Production Partner App",
  description:
    "Reference OAuth2 production client for live third-party campaign integrations.",
  redirectUris: ["https://partner.example.com/oauth/callback"],
  scopes: ["campaigns:read", "widgets:embed", "webhooks:manage"],
  environment: "production",
  tier: "free",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const INITIAL_SANDBOX_CAMPAIGNS: CampaignRecord[] = [
  {
    id: "sbx-camp-amazon-01",
    creator: "GDRIPS7SANDBOXAMAZONCREATOR777777777777777777777777777",
    name: "Amazon Basin Canopy Restoration (Sandbox)",
    description:
      "Restoring 25,000 native mahogany and brazil-nut trees across degraded riparian corridors in Para, Brazil.",
    location: "Para, Brazil",
    region: "South America",
    treeSpecies: "Mahogany & Brazil Nut",
    speciesId: "oak",
    status: "ACTIVE",
    goalAmount: "50000",
    raisedAmount: "34500",
    sponsorCount: 142,
    treeCount: 6900,
    co2Sequestration: "151.8",
    verified: true,
    verificationStatus: "verified",
    network: "testnet",
    createdAt: Date.parse("2026-02-15T10:00:00.000Z"),
    updatedAt: Date.parse("2026-10-01T14:30:00.000Z"),
    statusChangedAt: Date.parse("2026-02-15T10:00:00.000Z"),
    sponsors: [],
    statusHistory: [],
  },
  {
    id: "sbx-camp-mangrove-02",
    creator: "GDRIPS7SANDBOXMANGROVECREATOR8888888888888888888888888",
    name: "Niger Delta Blue Carbon Mangroves (Sandbox)",
    description:
      "Community-led coastal mangrove reforestation sequestering high-density blue carbon and protecting fisheries.",
    location: "Bayelsa, Nigeria",
    region: "Sub-Saharan Africa",
    treeSpecies: "Red Mangrove (Rhizophora)",
    speciesId: "mangrove",
    status: "ACTIVE",
    goalAmount: "25000",
    raisedAmount: "18750",
    sponsorCount: 89,
    treeCount: 4200,
    co2Sequestration: "117.6",
    verified: true,
    verificationStatus: "verified",
    network: "testnet",
    createdAt: Date.parse("2026-03-10T08:00:00.000Z"),
    updatedAt: Date.parse("2026-10-05T09:15:00.000Z"),
    statusChangedAt: Date.parse("2026-03-10T08:00:00.000Z"),
    sponsors: [],
    statusHistory: [],
  },
  {
    id: "sbx-camp-sahel-03",
    creator: "GDRIPS7SANDBOXSAHELCREATOR9999999999999999999999999999",
    name: "Great Green Wall Acacia Belt (Sandbox)",
    description:
      "Drought-resilient acacia agroforestry buffer halting desertification across smallholder farms in Senegal.",
    location: "Louga, Senegal",
    region: "West Africa",
    treeSpecies: "Acacia Senegal",
    speciesId: "acacia",
    status: "COMPLETED",
    goalAmount: "15000",
    raisedAmount: "15000",
    sponsorCount: 64,
    treeCount: 3000,
    co2Sequestration: "54.0",
    verified: true,
    verificationStatus: "verified",
    network: "testnet",
    createdAt: Date.parse("2026-01-20T12:00:00.000Z"),
    updatedAt: Date.parse("2026-08-20T18:00:00.000Z"),
    statusChangedAt: Date.parse("2026-08-20T18:00:00.000Z"),
    sponsors: [],
    statusHistory: [],
  },
];

// ── In-memory state stores ──────────────────────────────────────────────────

const oauthClients = new Map<string, OAuth2ClientRecord>();
const authCodes = new Map<string, OAuth2AuthorizationCodeRecord>();
const accessTokens = new Map<string, OAuth2TokenRecord>();
const refreshTokens = new Map<string, OAuth2TokenRecord>();
const quotaLogs = new Map<string, number[]>();
const webhookSubscriptions = new Map<string, PublicWebhookSubscriptionRecord>();
const webhookDeliveries: PublicWebhookDeliveryRecord[] = [];
const sandboxCampaigns = new Map<string, CampaignRecord>();

function ensureSeeded(): void {
  if (!oauthClients.has(DEFAULT_SANDBOX_CLIENT.clientId)) {
    oauthClients.set(DEFAULT_SANDBOX_CLIENT.clientId, { ...DEFAULT_SANDBOX_CLIENT });
  }
  if (!oauthClients.has(DEFAULT_PRODUCTION_CLIENT.clientId)) {
    oauthClients.set(DEFAULT_PRODUCTION_CLIENT.clientId, { ...DEFAULT_PRODUCTION_CLIENT });
  }
  if (sandboxCampaigns.size === 0) {
    for (const campaign of INITIAL_SANDBOX_CAMPAIGNS) {
      sandboxCampaigns.set(campaign.id, structuredClone(campaign));
    }
  }
}

export function resetPublicApiStateForTests(): void {
  oauthClients.clear();
  authCodes.clear();
  accessTokens.clear();
  refreshTokens.clear();
  quotaLogs.clear();
  webhookSubscriptions.clear();
  webhookDeliveries.length = 0;
  sandboxCampaigns.clear();
  ensureSeeded();
}

export function resetPublicApiSandbox(): {
  resetAt: string;
  sandboxCampaignCount: number;
  clearedWebhooks: number;
  clearedDeliveries: number;
} {
  ensureSeeded();
  sandboxCampaigns.clear();
  for (const campaign of INITIAL_SANDBOX_CAMPAIGNS) {
    sandboxCampaigns.set(campaign.id, structuredClone(campaign));
  }

  let clearedWebhooks = 0;
  for (const [id, sub] of webhookSubscriptions.entries()) {
    if (sub.environment === "sandbox") {
      webhookSubscriptions.delete(id);
      clearedWebhooks += 1;
    }
  }

  let clearedDeliveries = 0;
  for (let i = webhookDeliveries.length - 1; i >= 0; i--) {
    if (webhookDeliveries[i].environment === "sandbox") {
      webhookDeliveries.splice(i, 1);
      clearedDeliveries += 1;
    }
  }

  for (const [clientId, client] of oauthClients.entries()) {
    if (client.environment === "sandbox") {
      quotaLogs.delete(clientId);
    }
  }

  return {
    resetAt: new Date().toISOString(),
    sandboxCampaignCount: sandboxCampaigns.size,
    clearedWebhooks,
    clearedDeliveries,
  };
}

// ── Scope validation ────────────────────────────────────────────────────────

export function parseScopes(
  rawScopes?: string | string[] | null,
  fallback: PublicApiScope[] = [...PUBLIC_API_SCOPES],
): PublicApiScope[] {
  if (!rawScopes) return [...fallback];
  const parts = Array.isArray(rawScopes)
    ? rawScopes
    : rawScopes
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  if (parts.length === 0) return [...fallback];

  const valid = parts.filter((scope): scope is PublicApiScope =>
    (PUBLIC_API_SCOPES as readonly string[]).includes(scope),
  );
  if (valid.length !== parts.length) {
    throw new Error(
      `Invalid OAuth2 scope. Allowed scopes: ${PUBLIC_API_SCOPES.join(", ")}`,
    );
  }
  return Array.from(new Set(valid));
}

// ── OAuth2 Client Registration & Lookup ─────────────────────────────────────

export function listOAuth2Clients(
  environment?: PublicApiEnvironment,
): Array<Omit<OAuth2ClientRecord, "clientSecret"> & { clientSecretPreview: string }> {
  ensureSeeded();
  const list = Array.from(oauthClients.values()).filter(
    (c) => !environment || c.environment === environment,
  );
  return list.map(({ clientSecret, ...rest }) => ({
    ...rest,
    clientSecretPreview:
      clientSecret === DEFAULT_SANDBOX_CLIENT.clientSecret ||
      clientSecret === DEFAULT_PRODUCTION_CLIENT.clientSecret
        ? clientSecret
        : `${clientSecret.slice(0, 10)}...${clientSecret.slice(-4)}`,
  }));
}

export function getOAuth2Client(clientId: string): OAuth2ClientRecord | null {
  ensureSeeded();
  return oauthClients.get(clientId) ?? null;
}

export function registerOAuth2Client(input: {
  name: string;
  description?: string;
  redirectUris?: string[];
  scopes?: string[] | string;
  environment?: PublicApiEnvironment;
  tier?: PublicApiTier;
}): OAuth2ClientRecord {
  ensureSeeded();
  const name = input.name?.trim();
  if (!name) {
    throw new Error("Application name is required");
  }
  const environment: PublicApiEnvironment =
    input.environment === "production" ? "production" : "sandbox";
  const tier: PublicApiTier =
    input.tier && input.tier in PUBLIC_API_TIER_QUOTAS ? input.tier : "free";
  const scopes = parseScopes(input.scopes);
  const redirectUris = (input.redirectUris ?? ["https://localhost:3000/oauth/callback"]).map(
    (uri) => {
      try {
        new URL(uri);
        return uri;
      } catch {
        throw new Error(`Invalid redirect URI: ${uri}`);
      }
    },
  );

  const prefix = environment === "sandbox" ? "fnd_sbx" : "fnd_live";
  const shortId = randomUUID().replace(/-/g, "").slice(0, 12);
  const secretToken = randomUUID().replace(/-/g, "");

  const record: OAuth2ClientRecord = {
    clientId: `${prefix}_client_${shortId}`,
    clientSecret: `${prefix}_secret_${secretToken}`,
    name,
    description: input.description?.trim(),
    redirectUris,
    scopes,
    environment,
    tier,
    createdAt: new Date().toISOString(),
  };

  oauthClients.set(record.clientId, record);
  return record;
}

// ── OAuth2 Authorization Code & Token Issuance ──────────────────────────────

export function issueAuthorizationCode(
  input: {
    clientId: string;
    redirectUri?: string;
    scope?: string | string[];
  },
  now: number = Date.now(),
): OAuth2AuthorizationCodeRecord {
  ensureSeeded();
  const client = oauthClients.get(input.clientId);
  if (!client) {
    throw new Error("invalid_client: Unknown client_id");
  }

  const redirectUri = input.redirectUri || client.redirectUris[0];
  if (!redirectUri) {
    throw new Error("invalid_request: redirect_uri is required");
  }

  const requestedScopes = parseScopes(input.scope, client.scopes);
  const unauthorized = requestedScopes.filter((s) => !client.scopes.includes(s));
  if (unauthorized.length > 0) {
    throw new Error(
      `invalid_scope: Client is not authorized for scope(s): ${unauthorized.join(", ")}`,
    );
  }

  const code = `fnd_code_${client.environment}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const record: OAuth2AuthorizationCodeRecord = {
    code,
    clientId: client.clientId,
    redirectUri,
    scopes: requestedScopes,
    environment: client.environment,
    expiresAt: now + AUTH_CODE_TTL_MS,
    used: false,
  };

  authCodes.set(code, record);
  return record;
}

export function issueOAuth2Token(
  input: {
    grantType: OAuth2GrantType | string;
    clientId: string;
    clientSecret: string;
    code?: string;
    redirectUri?: string;
    refreshToken?: string;
    scope?: string | string[];
  },
  now: number = Date.now(),
): OAuth2TokenResponse {
  ensureSeeded();
  const client = oauthClients.get(input.clientId);
  if (!client || client.clientSecret !== input.clientSecret) {
    throw new Error("invalid_client: Invalid client_id or client_secret");
  }

  let grantedScopes: PublicApiScope[] = client.scopes;

  if (input.grantType === "client_credentials") {
    grantedScopes = parseScopes(input.scope, client.scopes);
    const unauthorized = grantedScopes.filter((s) => !client.scopes.includes(s));
    if (unauthorized.length > 0) {
      throw new Error(
        `invalid_scope: Client is not authorized for scope(s): ${unauthorized.join(", ")}`,
      );
    }
  } else if (input.grantType === "authorization_code") {
    if (!input.code) {
      throw new Error("invalid_request: authorization code is required");
    }
    const codeRecord = authCodes.get(input.code);
    if (!codeRecord || codeRecord.clientId !== client.clientId) {
      throw new Error("invalid_grant: Invalid authorization code");
    }
    if (codeRecord.used) {
      throw new Error("invalid_grant: Authorization code has already been used");
    }
    if (now > codeRecord.expiresAt) {
      throw new Error("invalid_grant: Authorization code has expired");
    }
    if (input.redirectUri && input.redirectUri !== codeRecord.redirectUri) {
      throw new Error("invalid_grant: redirect_uri mismatch");
    }
    codeRecord.used = true;
    grantedScopes = codeRecord.scopes;
  } else if (input.grantType === "refresh_token") {
    if (!input.refreshToken) {
      throw new Error("invalid_request: refresh_token is required");
    }
    const existing = refreshTokens.get(input.refreshToken);
    if (!existing || existing.clientId !== client.clientId) {
      throw new Error("invalid_grant: Invalid refresh_token");
    }
    grantedScopes = input.scope
      ? parseScopes(input.scope, existing.scopes)
      : existing.scopes;
    accessTokens.delete(existing.accessToken);
    refreshTokens.delete(existing.refreshToken);
  } else {
    throw new Error(
      `unsupported_grant_type: Supported grant types are client_credentials, authorization_code, refresh_token`,
    );
  }

  const prefix = client.environment === "sandbox" ? "fnd_at_sbx" : "fnd_at_live";
  const rtPrefix = client.environment === "sandbox" ? "fnd_rt_sbx" : "fnd_rt_live";
  const accessToken = `${prefix}_${randomUUID().replace(/-/g, "")}`;
  const refreshToken = `${rtPrefix}_${randomUUID().replace(/-/g, "")}`;

  const tokenRecord: OAuth2TokenRecord = {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    clientId: client.clientId,
    scopes: grantedScopes,
    environment: client.environment,
    tier: client.tier,
    issuedAt: now,
    expiresAt: now + ACCESS_TOKEN_TTL_SECONDS * 1_000,
  };

  accessTokens.set(accessToken, tokenRecord);
  refreshTokens.set(refreshToken, tokenRecord);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: grantedScopes.join(" "),
    environment: client.environment,
  };
}

// ── Request Authentication & Scope Verification ─────────────────────────────

export type PublicApiAuthResult =
  | {
      ok: true;
      token: OAuth2TokenRecord;
      client: OAuth2ClientRecord;
    }
  | {
      ok: false;
      status: 401 | 403;
      error: string;
      errorDescription: string;
    };

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token) return token;
  }
  return null;
}

export function authenticatePublicApiRequest(
  request: Request,
  requiredScope?: PublicApiScope,
  now: number = Date.now(),
): PublicApiAuthResult {
  ensureSeeded();
  const rawToken = extractBearerToken(request);
  if (!rawToken) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      errorDescription:
        "Missing OAuth2 Bearer token. Obtain an access token from POST /api/v1/oauth/token and pass it via Authorization: Bearer <token>.",
    };
  }

  const tokenRecord = accessTokens.get(rawToken);
  if (!tokenRecord) {
    return {
      ok: false,
      status: 401,
      error: "invalid_token",
      errorDescription: "The provided OAuth2 access token is invalid or has been revoked.",
    };
  }

  if (now > tokenRecord.expiresAt) {
    return {
      ok: false,
      status: 401,
      error: "expired_token",
      errorDescription: "The OAuth2 access token has expired. Refresh it via POST /api/v1/oauth/token.",
    };
  }

  if (requiredScope && !tokenRecord.scopes.includes(requiredScope)) {
    return {
      ok: false,
      status: 403,
      error: "insufficient_scope",
      errorDescription: `This endpoint requires the '${requiredScope}' OAuth2 scope. Current token scopes: ${tokenRecord.scopes.join(" ")}.`,
    };
  }

  const client = oauthClients.get(tokenRecord.clientId) ?? DEFAULT_SANDBOX_CLIENT;
  return {
    ok: true,
    token: tokenRecord,
    client,
  };
}

// ── Rate Limiting & Quota Management ────────────────────────────────────────

function computeWindowQuota(
  timestamps: number[],
  windowMs: number,
  limit: number,
  now: number,
): PublicApiQuotaWindow {
  const cutoff = now - windowMs;
  const active = timestamps.filter((t) => t > cutoff);
  const used = active.length;
  const remaining = Math.max(0, limit - used);
  const oldest = active.length > 0 ? Math.min(...active) : now;
  const resetAtMs = oldest + windowMs;
  const resetInSeconds = Math.max(1, Math.ceil((resetAtMs - now) / 1_000));
  const percentUsed =
    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return {
    limit,
    used,
    remaining,
    percentUsed,
    resetAt: new Date(resetAtMs).toISOString(),
    resetInSeconds,
  };
}

export function getPublicApiQuotaStatus(
  clientId: string = DEFAULT_SANDBOX_CLIENT.clientId,
  now: number = Date.now(),
): PublicApiQuotaStatus {
  ensureSeeded();
  const client = oauthClients.get(clientId) ?? DEFAULT_SANDBOX_CLIENT;
  const tierConfig = PUBLIC_API_TIER_QUOTAS[client.tier];
  const dayCutoff = now - DAY_MS;
  const rawTimestamps = quotaLogs.get(client.clientId) ?? [];
  const pruned = rawTimestamps.filter((t) => t > dayCutoff);
  quotaLogs.set(client.clientId, pruned);

  const hourly = computeWindowQuota(pruned, HOUR_MS, tierConfig.hourlyLimit, now);
  const daily = computeWindowQuota(pruned, DAY_MS, tierConfig.dailyLimit, now);
  const isThrottled = hourly.remaining === 0 || daily.remaining === 0;

  return {
    clientId: client.clientId,
    tier: client.tier,
    tierName: tierConfig.name,
    environment: client.environment,
    isThrottled,
    hourly,
    daily,
  };
}

export function consumePublicApiQuota(
  clientId: string,
  now: number = Date.now(),
): {
  allowed: boolean;
  quota: PublicApiQuotaStatus;
  headers: Record<string, string>;
} {
  ensureSeeded();
  const client = oauthClients.get(clientId) ?? DEFAULT_SANDBOX_CLIENT;
  const tierConfig = PUBLIC_API_TIER_QUOTAS[client.tier];
  const dayCutoff = now - DAY_MS;
  const existing = (quotaLogs.get(client.clientId) ?? []).filter((t) => t > dayCutoff);

  const preHourly = computeWindowQuota(existing, HOUR_MS, tierConfig.hourlyLimit, now);
  const preDaily = computeWindowQuota(existing, DAY_MS, tierConfig.dailyLimit, now);

  if (preHourly.used >= tierConfig.hourlyLimit || preDaily.used >= tierConfig.dailyLimit) {
    const quota = getPublicApiQuotaStatus(client.clientId, now);
    return {
      allowed: false,
      quota,
      headers: buildPublicApiQuotaHeaders(quota, false),
    };
  }

  existing.push(now);
  quotaLogs.set(client.clientId, existing);
  const quota = getPublicApiQuotaStatus(client.clientId, now);
  return {
    allowed: true,
    quota,
    headers: buildPublicApiQuotaHeaders(quota, true),
  };
}

export function buildPublicApiQuotaHeaders(
  quota: PublicApiQuotaStatus,
  allowed: boolean = true,
): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(quota.hourly.limit),
    "RateLimit-Remaining": String(quota.hourly.remaining),
    "RateLimit-Reset": String(quota.hourly.resetInSeconds),
    "X-RateLimit-Limit": String(quota.hourly.limit),
    "X-RateLimit-Remaining": String(quota.hourly.remaining),
    "X-RateLimit-Reset": String(quota.hourly.resetInSeconds),
    "X-Quota-Tier": quota.tier,
    "X-Quota-Limit": String(quota.daily.limit),
    "X-Quota-Used": String(quota.daily.used),
    "X-Quota-Remaining": String(quota.daily.remaining),
    "X-Quota-Reset": quota.daily.resetAt,
    "X-API-Environment": quota.environment,
  };

  if (!allowed) {
    const retryAfter =
      quota.hourly.remaining === 0
        ? quota.hourly.resetInSeconds
        : quota.daily.resetInSeconds;
    headers["Retry-After"] = String(Math.max(1, retryAfter));
  }

  return headers;
}

// ── Campaign Data & Sandbox Environment ─────────────────────────────────────

export function toPublicCampaignDto(
  campaign: CampaignRecord,
  environment: PublicApiEnvironment,
): PublicCampaignDto {
  const pct = progressPercent(campaign);
  const co2 =
    campaign.co2Sequestration !== undefined &&
    !Number.isNaN(Number(campaign.co2Sequestration))
      ? Number(campaign.co2Sequestration)
      : calculateCo2Offset(
          campaign.speciesId ?? "oak",
          Math.max(0, campaign.treeCount),
          campaign.createdAt,
        ).co2PerYearTonnes;

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description ?? "",
    creator: campaign.creator,
    status: campaign.status,
    location: campaign.location,
    region: campaign.region,
    treeSpecies: campaign.treeSpecies ?? campaign.species,
    goalAmount: campaign.goalAmount,
    raisedAmount: campaign.raisedAmount,
    progressPercent: pct,
    sponsorCount: campaign.sponsorCount,
    treeCount: campaign.treeCount,
    co2SequestrationTonnes: Math.round(co2 * 100) / 100,
    verified: Boolean(campaign.verified || campaign.verificationStatus === "verified"),
    network: campaign.network ?? "testnet",
    environment,
    createdAt: new Date(campaign.createdAt).toISOString(),
    updatedAt: new Date(campaign.updatedAt).toISOString(),
  };
}

export async function listPublicCampaigns(options: {
  environment: PublicApiEnvironment;
  status?: string;
  search?: string;
  creator?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  data: PublicCampaignDto[];
  pagination: { limit: number; offset: number; total: number };
}> {
  ensureSeeded();
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const offset = Math.max(0, options.offset ?? 0);

  if (options.environment === "sandbox") {
    let items = Array.from(sandboxCampaigns.values());
    if (options.status) {
      const target = options.status.toUpperCase();
      items = items.filter((c) => c.status.toUpperCase() === target);
    }
    if (options.creator) {
      const targetCreator = options.creator.toLowerCase();
      items = items.filter((c) => c.creator.toLowerCase() === targetCreator);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q) ||
          (c.location ?? "").toLowerCase().includes(q),
      );
    }
    const total = items.length;
    const paged = items
      .slice(offset, offset + limit)
      .map((c) => toPublicCampaignDto(c, "sandbox"));
    return {
      data: paged,
      pagination: { limit, offset, total },
    };
  }

  const liveCampaigns = await queryCampaigns({
    filter: {
      status: (options.status as CampaignRecord["status"]) || undefined,
      creator: options.creator,
      search: options.search,
    },
    limit,
    offset,
  });

  const data = liveCampaigns.map((c) => toPublicCampaignDto(c, "production"));
  return {
    data,
    pagination: { limit, offset, total: data.length },
  };
}

export async function getPublicCampaignById(
  id: string,
  environment: PublicApiEnvironment,
): Promise<{ record: CampaignRecord; dto: PublicCampaignDto } | null> {
  ensureSeeded();
  if (environment === "sandbox") {
    const record = sandboxCampaigns.get(id);
    if (!record) return null;
    return { record, dto: toPublicCampaignDto(record, "sandbox") };
  }

  const record = await getCampaign(id);
  if (!record) return null;
  return { record, dto: toPublicCampaignDto(record, "production") };
}

// ── Embeddable Widget Generation ────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPublicWidgetEmbedDto(
  campaign: CampaignRecord,
  options: {
    baseUrl: string;
    theme?: string;
    environment: PublicApiEnvironment;
  },
): PublicWidgetEmbedDto {
  const theme: WidgetTheme = resolveWidgetTheme(options.theme ?? DEFAULT_WIDGET_THEME);
  const base = options.baseUrl.replace(/\/+$/, "");
  const envParam = options.environment === "sandbox" ? "&environment=sandbox" : "";
  const iframeSrc = `${ widgetIframeSrc(campaign.id, base, theme)}${envParam}`;
  const iframeSnippet =
    options.environment === "sandbox"
      ? `<iframe src="${iframeSrc}" width="100%" height="${WIDGET_IFRAME_MIN_HEIGHT}" frameborder="0" loading="lazy" title="Fundable campaign impact (Sandbox)"></iframe>`
      : buildEmbedSnippet(campaign.id, base, theme);
  const scriptSnippet = `<div data-fundable-campaign="${escapeHtml(campaign.id)}" data-fundable-theme="${theme}" data-fundable-env="${options.environment}"></div>\n<script async src="${base}/api/v1/campaigns/${encodeURIComponent(campaign.id)}/widget?format=html&theme=${theme}${envParam}"></script>`;

  const trees = Math.max(0, campaign.treeCount);
  const impact = calculateCo2Offset(
    campaign.speciesId ?? "oak",
    trees,
    campaign.createdAt,
  );
  const pct = progressPercent(campaign);

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    theme,
    environment: options.environment,
    iframeSrc,
    minHeight: WIDGET_IFRAME_MIN_HEIGHT,
    iframeSnippet,
    scriptSnippet,
    metrics: {
      progressPercent: pct,
      raisedAmount: campaign.raisedAmount,
      goalAmount: campaign.goalAmount,
      treeCount: trees,
      co2PerYearTonnes: Number(impact.co2PerYearTonnes.toFixed(1)),
      co2Over10YearsTonnes: Number(impact.co2Over10YearsTonnes.toFixed(1)),
      sponsorCount: campaign.sponsorCount,
    },
  };
}

export function renderPublicWidgetHtml(
  campaign: CampaignRecord,
  theme: WidgetTheme,
  environment: PublicApiEnvironment,
): string {
  const t = WIDGET_THEMES[theme];
  const trees = Math.max(0, campaign.treeCount);
  const impact = calculateCo2Offset(
    campaign.speciesId ?? "oak",
    trees,
    campaign.createdAt,
  );
  const pct = progressPercent(campaign);
  const badgeHtml =
    environment === "sandbox"
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:#f59e0b;color:#0f172a;margin-left:6px">SANDBOX</span>`
      : "";

  const bgHex =
    t.bg === "bg-white" ? "#ffffff" : t.bg === "bg-slate-900" ? "#0f172a" : "#0b1f16";
  const textHex =
    t.text === "text-slate-900" ? "#0f172a" : t.text === "text-white" ? "#ffffff" : "#ecfdf5";
  const borderHex =
    t.border === "border-slate-200" ? "#e2e8f0" : t.border === "border-slate-700" ? "#334155" : "#14532d";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(campaign.name)} — Fundable Widget</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: ${bgHex}; color: ${textHex}; padding: 16px; }
  .card { max-width: 420px; margin: 0 auto; border: 1px solid ${borderHex}; border-radius: 14px; padding: 18px; }
  .eyebrow { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.75; }
  .title { margin-top: 6px; font-size: 17px; font-weight: 700; line-height: 1.35; }
  .row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
  .track { height: 9px; border-radius: 999px; overflow: hidden; margin: 6px 0 6px; background: rgba(16,185,129,0.18); }
  .fill { height: 100%; border-radius: 999px; background: #10b981; width: ${pct}%; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
  .tile { border: 1px solid ${borderHex}; border-radius: 12px; padding: 12px 6px; text-align: center; }
  .tile-value { font-size: 18px; font-weight: 800; color: #10b981; }
  .tile-label { font-size: 10px; text-transform: uppercase; opacity: 0.75; margin-top: 2px; }
</style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">Fundable Campaign Impact ${badgeHtml}</div>
    <h1 class="title">${escapeHtml(campaign.name)}</h1>
    <div style="margin-top:14px">
      <div class="row"><span>Funded</span><strong>${pct}%</strong></div>
      <div class="track"><div class="fill"></div></div>
      <div class="row"><span>${escapeHtml(campaign.raisedAmount)} USDC raised</span><span>Goal ${escapeHtml(campaign.goalAmount)} USDC</span></div>
    </div>
    <div class="grid">
      <div class="tile"><div class="tile-value">${trees.toLocaleString()}</div><div class="tile-label">Trees</div></div>
      <div class="tile"><div class="tile-value">${impact.co2PerYearTonnes.toFixed(1)}</div><div class="tile-label">t CO₂ / yr</div></div>
      <div class="tile"><div class="tile-value">${campaign.sponsorCount}</div><div class="tile-label">Sponsors</div></div>
    </div>
  </div>
</body>
</html>`;
}

// ── Third-Party Webhooks & HMAC Signature Verification ──────────────────────

export function computePublicWebhookSignature(
  timestamp: number,
  rawPayload: string,
  secret: string,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawPayload}`)
    .digest("hex");
  return `sha256=${digest}`;
}

export function registerPublicWebhookSubscription(input: {
  clientId: string;
  environment: PublicApiEnvironment;
  url: string;
  events: string[];
  secret?: string;
  campaignId?: string;
}): PublicWebhookSubscriptionRecord {
  ensureSeeded();
  try {
    const parsedUrl = new URL(input.url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error("Webhook URL must use http or https protocol");
    }
  } catch {
    throw new Error("Invalid webhook destination URL");
  }

  if (!Array.isArray(input.events) || input.events.length === 0) {
    throw new Error("At least one webhook event type is required");
  }

  const validEvents = input.events.filter((e): e is PublicWebhookEventType =>
    (PUBLIC_WEBHOOK_EVENTS as readonly string[]).includes(e),
  );
  if (validEvents.length !== input.events.length) {
    throw new Error(
      `Invalid webhook event type. Supported events: ${PUBLIC_WEBHOOK_EVENTS.join(", ")}`,
    );
  }

  const secret =
    input.secret && input.secret.trim().length >= 8
      ? input.secret.trim()
      : `whsec_${randomUUID().replace(/-/g, "")}`;

  const record: PublicWebhookSubscriptionRecord = {
    id: `whsub_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    clientId: input.clientId,
    url: input.url,
    events: Array.from(new Set(validEvents)),
    secret,
    campaignId: input.campaignId?.trim() || undefined,
    environment: input.environment,
    active: true,
    createdAt: new Date().toISOString(),
  };

  webhookSubscriptions.set(record.id, record);
  return record;
}

export function listPublicWebhookSubscriptions(
  clientId: string,
  environment?: PublicApiEnvironment,
): PublicWebhookSubscriptionRecord[] {
  ensureSeeded();
  return Array.from(webhookSubscriptions.values()).filter(
    (sub) =>
      sub.clientId === clientId &&
      (!environment || sub.environment === environment),
  );
}

export function deletePublicWebhookSubscription(
  subscriptionId: string,
  clientId: string,
): boolean {
  ensureSeeded();
  const sub = webhookSubscriptions.get(subscriptionId);
  if (!sub || sub.clientId !== clientId) return false;
  return webhookSubscriptions.delete(subscriptionId);
}

export function triggerSandboxWebhookEvent(
  input: {
    clientId: string;
    environment: PublicApiEnvironment;
    event: PublicWebhookEventType;
    campaignId?: string;
    subscriptionId?: string;
    customPayload?: Record<string, unknown>;
  },
  now: number = Date.now(),
): {
  delivery: PublicWebhookDeliveryRecord;
  headers: Record<string, string>;
} {
  ensureSeeded();
  if (!(PUBLIC_WEBHOOK_EVENTS as readonly string[]).includes(input.event)) {
    throw new Error(
      `Unsupported webhook event '${input.event}'. Supported events: ${PUBLIC_WEBHOOK_EVENTS.join(", ")}`,
    );
  }

  const clientSubs = listPublicWebhookSubscriptions(input.clientId, input.environment);
  const matchingSub = input.subscriptionId
    ? clientSubs.find((s) => s.id === input.subscriptionId)
    : clientSubs.find((s) => s.events.includes(input.event)) ?? clientSubs[0];

  const targetUrl = matchingSub?.url ?? "https://sandbox-receiver.example.com/webhooks/fundable";
  const secret = matchingSub?.secret ?? "whsec_sandbox_default_signing_secret";
  const subscriptionId = matchingSub?.id ?? "whsub_sandbox_ephemeral";
  const campaignId = input.campaignId || "sbx-camp-amazon-01";
  const deliveryId = `whdel_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const timestamp = Math.floor(now / 1_000);

  const payload: Record<string, unknown> = {
    id: deliveryId,
    event: input.event,
    environment: input.environment,
    createdAt: new Date(now).toISOString(),
    data: {
      campaignId,
      campaignName: "Amazon Basin Canopy Restoration (Sandbox)",
      raisedAmount: "34500",
      goalAmount: "50000",
      treeCount: 6900,
      co2SequestrationTonnes: 151.8,
      ...(input.customPayload ?? {}),
    },
  };

  const rawBody = JSON.stringify(payload);
  const signature = computePublicWebhookSignature(timestamp, rawBody, secret);

  const delivery: PublicWebhookDeliveryRecord = {
    deliveryId,
    subscriptionId,
    clientId: input.clientId,
    event: input.event,
    environment: input.environment,
    url: targetUrl,
    timestamp,
    signature,
    statusCode: 200,
    delivered: true,
    payload,
    createdAt: new Date(now).toISOString(),
  };

  webhookDeliveries.unshift(delivery);
  if (webhookDeliveries.length > 50) {
    webhookDeliveries.length = 50;
  }

  return {
    delivery,
    headers: {
      "Content-Type": "application/json",
      "X-Fundable-Signature": signature,
      "X-Webhook-Signature": signature.replace(/^sha256=/, ""),
      "X-Webhook-Timestamp": String(timestamp),
      "X-Webhook-Event": input.event,
      "X-Webhook-Delivery-Id": deliveryId,
      "X-API-Environment": input.environment,
    },
  };
}

export function listPublicWebhookDeliveries(
  clientId: string,
  environment?: PublicApiEnvironment,
): PublicWebhookDeliveryRecord[] {
  ensureSeeded();
  return webhookDeliveries.filter(
    (d) =>
      d.clientId === clientId &&
      (!environment || d.environment === environment),
  );
}

// ── Developer Portal API Reference Documentation ────────────────────────────

export const PUBLIC_API_REFERENCE_DOCS: readonly PublicApiEndpointDoc[] = [
  {
    method: "POST",
    path: "/api/v1/oauth/token",
    summary: "Exchange OAuth2 credentials or authorization code for a Bearer token",
    requiredScope: "none",
    description:
      "Issues an RFC 6749 OAuth2 Bearer access token and refresh token. Supports client_credentials, authorization_code, and refresh_token grant types.",
    sampleRequest: JSON.stringify(
      {
        grant_type: "client_credentials",
        client_id: "fnd_sbx_client_demo",
        client_secret: "fnd_sbx_secret_demo_2026",
        scope: "campaigns:read widgets:embed webhooks:manage",
      },
      null,
      2,
    ),
    sampleResponse: JSON.stringify(
      {
        access_token: "fnd_at_sbx_9f8e7d6c5b4a3210",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "fnd_rt_sbx_123456789abcdef0",
        scope: "campaigns:read widgets:embed webhooks:manage",
        environment: "sandbox",
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/v1/campaigns",
    summary: "List public campaigns with filtering and pagination",
    requiredScope: "campaigns:read",
    description:
      "Returns paginated campaign records, funding progress, tree counts, and verified CO₂ sequestration metrics. Automatically routes to isolated sandbox data when authenticated with a sandbox OAuth2 token.",
    sampleResponse: JSON.stringify(
      {
        data: [
          {
            id: "sbx-camp-amazon-01",
            name: "Amazon Basin Canopy Restoration (Sandbox)",
            status: "ACTIVE",
            goalAmount: "50000",
            raisedAmount: "34500",
            progressPercent: 69,
            treeCount: 6900,
            co2SequestrationTonnes: 151.8,
            environment: "sandbox",
          },
        ],
        pagination: { limit: 20, offset: 0, total: 3 },
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/v1/campaigns/{id}",
    summary: "Retrieve a single campaign and ecological impact breakdown",
    requiredScope: "campaigns:read",
    description:
      "Fetches complete campaign details, verification badges, sponsor counts, and ecological impact totals by campaign ID.",
    sampleResponse: JSON.stringify(
      {
        data: {
          id: "sbx-camp-amazon-01",
          name: "Amazon Basin Canopy Restoration (Sandbox)",
          status: "ACTIVE",
          goalAmount: "50000",
          raisedAmount: "34500",
          progressPercent: 69,
          sponsorCount: 142,
          treeCount: 6900,
          co2SequestrationTonnes: 151.8,
          verified: true,
          environment: "sandbox",
        },
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/v1/campaigns/{id}/widget",
    summary: "Generate embeddable campaign widget HTML or JSON snippet metadata",
    requiredScope: "widgets:embed",
    description:
      "Returns embeddable iframe & script snippets, real-time impact metrics, or standalone HTML (?format=html) styled with light, dark, or forest themes.",
    sampleResponse: JSON.stringify(
      {
        campaignId: "sbx-camp-amazon-01",
        theme: "forest",
        environment: "sandbox",
        iframeSrc:
          "https://fundable.network/api/campaigns/sbx-camp-amazon-01/widget?theme=forest&environment=sandbox",
        iframeSnippet:
          '<iframe src="https://fundable.network/api/campaigns/sbx-camp-amazon-01/widget?theme=forest&environment=sandbox" width="100%" height="360" frameborder="0" loading="lazy" title="Fundable campaign impact (Sandbox)"></iframe>',
      },
      null,
      2,
    ),
  },
  {
    method: "POST",
    path: "/api/v1/webhooks",
    summary: "Register a webhook endpoint for real-time campaign events",
    requiredScope: "webhooks:manage",
    description:
      "Subscribes an HTTPS endpoint to campaign lifecycle and tree verification events. Payloads are signed using HMAC-SHA256 in the X-Fundable-Signature header.",
    sampleRequest: JSON.stringify(
      {
        url: "https://partner.example.com/webhooks/fundable",
        events: ["campaign.milestone_reached", "tree_verified"],
        campaignId: "sbx-camp-amazon-01",
      },
      null,
      2,
    ),
    sampleResponse: JSON.stringify(
      {
        id: "whsub_4f8b92e1a3c07d12",
        url: "https://partner.example.com/webhooks/fundable",
        events: ["campaign.milestone_reached", "tree_verified"],
        secret: "whsec_9a8b7c6d5e4f3a2b1c0d",
        environment: "sandbox",
        active: true,
      },
      null,
      2,
    ),
  },
  {
    method: "POST",
    path: "/api/v1/webhooks/test",
    summary: "Trigger a signed sandbox webhook event for integration testing",
    requiredScope: "webhooks:manage",
    description:
      "Simulates a campaign or verification webhook dispatch in the sandbox environment and returns the exact signed payload and HMAC headers.",
    sampleRequest: JSON.stringify(
      {
        event: "campaign.milestone_reached",
        campaignId: "sbx-camp-amazon-01",
      },
      null,
      2,
    ),
    sampleResponse: JSON.stringify(
      {
        delivery: {
          deliveryId: "whdel_7a1c9e3f0b2d4e6a",
          event: "campaign.milestone_reached",
          statusCode: 200,
          delivered: true,
        },
      },
      null,
      2,
    ),
  },
  {
    method: "GET",
    path: "/api/v1/quota",
    summary: "Inspect current rate-limit window and daily quota consumption",
    requiredScope: "campaigns:read",
    description:
      "Returns real-time hourly and daily request quotas, percentage used, remaining calls, and reset timestamps for the authenticated OAuth2 client.",
    sampleResponse: JSON.stringify(
      {
        clientId: "fnd_sbx_client_demo",
        tier: "pro",
        environment: "sandbox",
        isThrottled: false,
        hourly: { limit: 1000, used: 12, remaining: 988, percentUsed: 1, resetInSeconds: 3420 },
        daily: { limit: 25000, used: 48, remaining: 24952, percentUsed: 0, resetInSeconds: 82100 },
      },
      null,
      2,
    ),
  },
];
