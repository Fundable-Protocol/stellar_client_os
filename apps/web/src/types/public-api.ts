import type { WidgetTheme } from "@/lib/widget-theme";

export type PublicApiEnvironment = "sandbox" | "production";

export type PublicApiScope =
  | "campaigns:read"
  | "widgets:embed"
  | "webhooks:manage";

export type OAuth2GrantType =
  | "client_credentials"
  | "authorization_code"
  | "refresh_token";

export type PublicApiTier = "free" | "pro" | "enterprise";

export interface PublicApiTierQuotaConfig {
  id: PublicApiTier;
  name: string;
  hourlyLimit: number;
  dailyLimit: number;
  burstPerMinute: number;
  description: string;
}

export interface OAuth2ClientRecord {
  clientId: string;
  clientSecret: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes: PublicApiScope[];
  environment: PublicApiEnvironment;
  tier: PublicApiTier;
  createdAt: string;
}

export interface OAuth2AuthorizationCodeRecord {
  code: string;
  clientId: string;
  redirectUri: string;
  scopes: PublicApiScope[];
  environment: PublicApiEnvironment;
  expiresAt: number;
  used: boolean;
}

export interface OAuth2TokenRecord {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  clientId: string;
  scopes: PublicApiScope[];
  environment: PublicApiEnvironment;
  tier: PublicApiTier;
  issuedAt: number;
  expiresAt: number;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
  environment: PublicApiEnvironment;
}

export interface PublicApiQuotaWindow {
  limit: number;
  used: number;
  remaining: number;
  percentUsed: number;
  resetAt: string;
  resetInSeconds: number;
}

export interface PublicApiQuotaStatus {
  clientId: string;
  tier: PublicApiTier;
  tierName: string;
  environment: PublicApiEnvironment;
  isThrottled: boolean;
  hourly: PublicApiQuotaWindow;
  daily: PublicApiQuotaWindow;
}

export interface PublicCampaignDto {
  id: string;
  name: string;
  description: string;
  creator: string;
  status: string;
  location?: string;
  region?: string;
  treeSpecies?: string;
  goalAmount: string;
  raisedAmount: string;
  progressPercent: number;
  sponsorCount: number;
  treeCount: number;
  co2SequestrationTonnes: number;
  verified: boolean;
  network: "testnet" | "mainnet";
  environment: PublicApiEnvironment;
  createdAt: string;
  updatedAt: string;
}

export interface PublicWidgetEmbedDto {
  campaignId: string;
  campaignName: string;
  theme: WidgetTheme;
  environment: PublicApiEnvironment;
  iframeSrc: string;
  minHeight: number;
  iframeSnippet: string;
  scriptSnippet: string;
  metrics: {
    progressPercent: number;
    raisedAmount: string;
    goalAmount: string;
    treeCount: number;
    co2PerYearTonnes: number;
    co2Over10YearsTonnes: number;
    sponsorCount: number;
  };
}

export type PublicWebhookEventType =
  | "campaign.created"
  | "campaign.donation_received"
  | "campaign.milestone_reached"
  | "campaign.completed"
  | "tree_verified"
  | "batch_verified";

export interface PublicWebhookSubscriptionRecord {
  id: string;
  clientId: string;
  url: string;
  events: PublicWebhookEventType[];
  secret: string;
  campaignId?: string;
  environment: PublicApiEnvironment;
  active: boolean;
  createdAt: string;
}

export interface PublicWebhookDeliveryRecord {
  deliveryId: string;
  subscriptionId: string;
  clientId: string;
  event: PublicWebhookEventType;
  environment: PublicApiEnvironment;
  url: string;
  timestamp: number;
  signature: string;
  statusCode: number;
  delivered: boolean;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PublicApiEndpointDoc {
  method: "GET" | "POST" | "DELETE";
  path: string;
  summary: string;
  requiredScope: PublicApiScope | "none";
  description: string;
  sampleRequest?: string;
  sampleResponse: string;
}
