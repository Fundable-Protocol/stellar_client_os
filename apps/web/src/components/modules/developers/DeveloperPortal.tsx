"use client";

import React, { useState } from "react";
import {
  DEFAULT_PRODUCTION_CLIENT,
  DEFAULT_SANDBOX_CLIENT,
  PUBLIC_API_REFERENCE_DOCS,
  PUBLIC_API_SCOPES,
  PUBLIC_API_TIER_QUOTAS,
  PUBLIC_WEBHOOK_EVENTS,
} from "@/services/public-api.service";
import type {
  PublicApiEnvironment,
  PublicApiQuotaStatus,
  PublicWebhookEventType,
} from "@/types/public-api";
import type { WidgetTheme } from "@/lib/widget-theme";

const INITIAL_QUOTA: PublicApiQuotaStatus = {
  clientId: DEFAULT_SANDBOX_CLIENT.clientId,
  tier: DEFAULT_SANDBOX_CLIENT.tier,
  tierName: PUBLIC_API_TIER_QUOTAS[DEFAULT_SANDBOX_CLIENT.tier].name,
  environment: "sandbox",
  isThrottled: false,
  hourly: {
    limit: PUBLIC_API_TIER_QUOTAS[DEFAULT_SANDBOX_CLIENT.tier].hourlyLimit,
    used: 4,
    remaining: PUBLIC_API_TIER_QUOTAS[DEFAULT_SANDBOX_CLIENT.tier].hourlyLimit - 4,
    percentUsed: 0,
    resetAt: new Date(Date.now() + 3600_000).toISOString(),
    resetInSeconds: 3600,
  },
  daily: {
    limit: PUBLIC_API_TIER_QUOTAS[DEFAULT_SANDBOX_CLIENT.tier].dailyLimit,
    used: 18,
    remaining: PUBLIC_API_TIER_QUOTAS[DEFAULT_SANDBOX_CLIENT.tier].dailyLimit - 18,
    percentUsed: 0,
    resetAt: new Date(Date.now() + 86400_000).toISOString(),
    resetInSeconds: 86400,
  },
};

export function DeveloperPortal() {
  const [environment, setEnvironment] = useState<PublicApiEnvironment>("sandbox");
  const [activeTab, setActiveTab] = useState<"reference" | "sandbox" | "widgets" | "webhooks">(
    "reference",
  );
  const [accessToken, setAccessToken] = useState<string>("");
  const [tokenScope, setTokenScope] = useState<string>(PUBLIC_API_SCOPES.join(" "));
  const [quota, setQuota] = useState<PublicApiQuotaStatus>(INITIAL_QUOTA);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("sbx-camp-amazon-01");
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme>("forest");
  const [webhookUrl, setWebhookUrl] = useState<string>(
    "https://sandbox-receiver.example.com/webhooks/fundable",
  );
  const [selectedWebhookEvent, setSelectedWebhookEvent] = useState<PublicWebhookEventType>(
    "campaign.milestone_reached",
  );
  const [sandboxOutput, setSandboxOutput] = useState<string>(
    JSON.stringify(
      {
        status: "Ready",
        environment: "sandbox",
        hint: "Generate an OAuth2 Bearer token or run a sandbox request below.",
      },
      null,
      2,
    ),
  );
  const [lastHeaders, setLastHeaders] = useState<Record<string, string>>({
    "RateLimit-Limit": String(INITIAL_QUOTA.hourly.limit),
    "RateLimit-Remaining": String(INITIAL_QUOTA.hourly.remaining),
    "RateLimit-Reset": String(INITIAL_QUOTA.hourly.resetInSeconds),
    "X-Quota-Limit": String(INITIAL_QUOTA.daily.limit),
    "X-Quota-Remaining": String(INITIAL_QUOTA.daily.remaining),
    "X-API-Environment": "sandbox",
  });

  const activeClient =
    environment === "sandbox" ? DEFAULT_SANDBOX_CLIENT : DEFAULT_PRODUCTION_CLIENT;

  async function handleGenerateToken() {
    try {
      const res = await fetch("/api/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: activeClient.clientId,
          client_secret: activeClient.clientSecret,
          scope: tokenScope,
        }),
      });
      const json = await res.json();
      if (json.access_token) {
        setAccessToken(json.access_token);
      }
      setSandboxOutput(JSON.stringify(json, null, 2));
    } catch {
      const simulated = `fnd_at_${environment === "sandbox" ? "sbx" : "live"}_demo_token_2026`;
      setAccessToken(simulated);
      setSandboxOutput(
        JSON.stringify(
          {
            access_token: simulated,
            token_type: "Bearer",
            expires_in: 3600,
            scope: tokenScope,
            environment,
          },
          null,
          2,
        ),
      );
    }
  }

  async function handleFetchCampaigns() {
    try {
      const res = await fetch(`/api/v1/campaigns?environment=${environment}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const json = await res.json();
      if (json?.meta?.quota) {
        setQuota(json.meta.quota);
      }
      setLastHeaders({
        "RateLimit-Limit": res.headers.get("RateLimit-Limit") ?? String(quota.hourly.limit),
        "RateLimit-Remaining":
          res.headers.get("RateLimit-Remaining") ?? String(quota.hourly.remaining - 1),
        "RateLimit-Reset": res.headers.get("RateLimit-Reset") ?? "3600",
        "X-Quota-Limit": res.headers.get("X-Quota-Limit") ?? String(quota.daily.limit),
        "X-Quota-Remaining":
          res.headers.get("X-Quota-Remaining") ?? String(quota.daily.remaining - 1),
        "X-API-Environment": res.headers.get("X-API-Environment") ?? environment,
      });
      setSandboxOutput(JSON.stringify(json, null, 2));
    } catch (err) {
      setSandboxOutput(
        JSON.stringify({ error: err instanceof Error ? err.message : "Request failed" }, null, 2),
      );
    }
  }

  async function handleTriggerWebhookTest() {
    try {
      const res = await fetch("/api/v1/webhooks/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          event: selectedWebhookEvent,
          campaignId: selectedCampaignId,
        }),
      });
      const json = await res.json();
      if (json?.meta?.quota) {
        setQuota(json.meta.quota);
      }
      setSandboxOutput(JSON.stringify(json, null, 2));
    } catch (err) {
      setSandboxOutput(
        JSON.stringify({ error: err instanceof Error ? err.message : "Webhook test failed" }, null, 2),
      );
    }
  }

  async function handleResetSandbox() {
    try {
      const res = await fetch("/api/v1/sandbox/reset", { method: "POST" });
      const json = await res.json();
      setQuota(INITIAL_QUOTA);
      setSandboxOutput(JSON.stringify(json, null, 2));
    } catch {
      setQuota(INITIAL_QUOTA);
    }
  }

  const iframeEmbedSnippet = `<iframe src="https://fundable.network/api/v1/campaigns/${selectedCampaignId}/widget?format=html&theme=${widgetTheme}&environment=${environment}" width="100%" height="360" frameborder="0" loading="lazy" title="Fundable campaign impact"></iframe>`;

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 text-white">
      {/* Header & Environment Switcher */}
      <header className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              REST API v1 · OAuth 2.0
            </span>
            <span
              data-testid="environment-badge"
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                environment === "sandbox"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-sky-500/20 text-sky-300"
              }`}
            >
              {environment === "sandbox" ? "Sandbox Environment" : "Production Environment"}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold md:text-3xl">
            Fundable Developer Portal & Public Campaign API
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Authenticate with OAuth2, read verified campaign impact metrics, embed customizable widgets, and subscribe to signed webhooks.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setEnvironment("sandbox")}
            aria-pressed={environment === "sandbox"}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              environment === "sandbox"
                ? "bg-amber-400 text-black"
                : "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            Sandbox Mode
          </button>
          <button
            type="button"
            onClick={() => setEnvironment("production")}
            aria-pressed={environment === "production"}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              environment === "production"
                ? "bg-emerald-400 text-black"
                : "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            Production Mode
          </button>
        </div>
      </header>

      {/* Rate Limiting & Clear Quota Display */}
      <section
        aria-label="Rate Limiting & Quota Status"
        className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6"
      >
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Rate Limiting & Quota Usage</h2>
            <p className="text-xs text-zinc-400">
              Active Tier: <strong className="text-emerald-300">{quota.tierName}</strong> · Client:{" "}
              <code className="text-zinc-200">{activeClient.clientId}</code>
            </p>
          </div>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            Status: {quota.isThrottled ? "Throttled (429)" : "Healthy"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {/* Hourly Sliding Window */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="font-semibold uppercase tracking-wider text-zinc-400">
                Hourly Rate Limit Window
              </span>
              <span data-testid="hourly-quota-summary" className="font-mono font-semibold">
                {quota.hourly.used} / {quota.hourly.limit} req ({quota.hourly.remaining} remaining)
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: `${Math.max(2, quota.hourly.percentUsed)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              Resets in {quota.hourly.resetInSeconds}s · Header:{" "}
              <code>RateLimit-Remaining: {quota.hourly.remaining}</code>
            </p>
          </div>

          {/* Daily Quota Window */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="font-semibold uppercase tracking-wider text-zinc-400">
                Daily Quota Allocation
              </span>
              <span data-testid="daily-quota-summary" className="font-mono font-semibold">
                {quota.daily.used} / {quota.daily.limit} req ({quota.daily.remaining} remaining)
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-sky-400 transition-all"
                style={{ width: `${Math.max(2, quota.daily.percentUsed)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              Resets at {quota.daily.resetAt} · Header:{" "}
              <code>X-Quota-Remaining: {quota.daily.remaining}</code>
            </p>
          </div>
        </div>

        {/* Tier Comparison Table */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Object.values(PUBLIC_API_TIER_QUOTAS).map((tierItem) => (
            <div
              key={tierItem.id}
              className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 text-xs"
            >
              <div className="font-semibold text-white">{tierItem.name}</div>
              <div className="mt-1 font-mono text-emerald-300">
                {tierItem.hourlyLimit.toLocaleString()} req/hr ·{" "}
                {tierItem.dailyLimit.toLocaleString()} req/day
              </div>
              <p className="mt-1 text-[11px] text-zinc-400">{tierItem.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3" role="tablist">
        {(
          [
            { id: "reference", label: "API Reference Documentation" },
            { id: "sandbox", label: "OAuth2 & Sandbox Console" },
            { id: "widgets", label: "Embeddable Widgets" },
            { id: "webhooks", label: "Webhooks & Signature Tester" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === tab.id
                ? "bg-emerald-500 text-black"
                : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: API Reference Documentation */}
      {activeTab === "reference" && (
        <section aria-label="API Reference Documentation" className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="text-base font-semibold">OAuth 2.0 Scopes & Authentication</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Exchange your <code>client_id</code> and <code>client_secret</code> at{" "}
              <code>POST /api/v1/oauth/token</code> and include{" "}
              <code>Authorization: Bearer &lt;access_token&gt;</code> on all API requests.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PUBLIC_API_SCOPES.map((scope) => (
                <span
                  key={scope}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 font-mono text-xs text-emerald-300"
                >
                  {scope}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {PUBLIC_API_REFERENCE_DOCS.map((endpoint) => (
              <article
                key={`${endpoint.method}-${endpoint.path}`}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded px-2.5 py-1 font-mono text-xs font-bold ${
                        endpoint.method === "GET"
                          ? "bg-sky-500/20 text-sky-300"
                          : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {endpoint.method}
                    </span>
                    <code className="text-sm font-semibold text-white">{endpoint.path}</code>
                  </div>
                  <span className="rounded bg-zinc-800 px-2.5 py-1 font-mono text-xs text-zinc-300">
                    Scope: {endpoint.requiredScope}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-zinc-200">{endpoint.summary}</p>
                <p className="mt-1 text-xs text-zinc-400">{endpoint.description}</p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {endpoint.sampleRequest && (
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase text-zinc-400">
                        Request Payload
                      </div>
                      <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                        {endpoint.sampleRequest}
                      </pre>
                    </div>
                  )}
                  <div className={endpoint.sampleRequest ? "" : "md:col-span-2"}>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-zinc-400">
                      Sample Response (200 / 201)
                    </div>
                    <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-emerald-300">
                      {endpoint.sampleResponse}
                    </pre>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Tab 2: OAuth2 & Sandbox Console */}
      {activeTab === "sandbox" && (
        <section aria-label="Interactive Sandbox Console" className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h3 className="text-base font-semibold">1. OAuth2 Sandbox Credentials</h3>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-zinc-400">Client ID: </span>
                <code className="rounded bg-zinc-950 px-2 py-0.5 text-emerald-300">
                  {activeClient.clientId}
                </code>
              </div>
              <div>
                <span className="text-zinc-400">Client Secret: </span>
                <code className="rounded bg-zinc-950 px-2 py-0.5 text-amber-300">
                  {activeClient.clientSecret}
                </code>
              </div>
              <div>
                <label htmlFor="oauth-scope-input" className="block text-zinc-400">
                  Requested Scopes
                </label>
                <input
                  id="oauth-scope-input"
                  type="text"
                  value={tokenScope}
                  onChange={(e) => setTokenScope(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={handleGenerateToken}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400"
              >
                Generate OAuth2 Bearer Token
              </button>
              <button
                type="button"
                onClick={handleFetchCampaigns}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
              >
                Test GET /api/v1/campaigns
              </button>
              <button
                type="button"
                onClick={handleResetSandbox}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                Reset Sandbox State
              </button>
            </div>

            {accessToken && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                <div className="font-semibold text-emerald-300">Active Bearer Token:</div>
                <code className="mt-1 block break-all font-mono text-[11px] text-white">
                  {accessToken}
                </code>
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h3 className="text-base font-semibold">2. Sandbox Response & Rate-Limit Headers</h3>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-950 p-3 font-mono text-[11px]">
              {Object.entries(lastHeaders).map(([k, v]) => (
                <div key={k} className="truncate">
                  <span className="text-zinc-400">{k}:</span>{" "}
                  <span className="text-emerald-300">{v}</span>
                </div>
              ))}
            </div>
            <pre
              data-testid="sandbox-console-output"
              className="max-h-80 overflow-auto rounded-xl bg-zinc-950 p-4 font-mono text-xs text-emerald-300"
            >
              {sandboxOutput}
            </pre>
          </div>
        </section>
      )}

      {/* Tab 3: Embeddable Widgets */}
      {activeTab === "widgets" && (
        <section aria-label="Embeddable Widget Builder" className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-base font-semibold">Embeddable Campaign Impact Widget</h3>
          <p className="text-xs text-zinc-400">
            Configure and embed live campaign progress and CO₂ offset metrics on any external site.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="widget-campaign-select" className="block text-xs text-zinc-400">
                Sandbox Campaign ID
              </label>
              <select
                id="widget-campaign-select"
                value={selectedCampaignId}
                onChange={(e) => setSelectedCampaignId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                <option value="sbx-camp-amazon-01">sbx-camp-amazon-01 (Amazon Canopy)</option>
                <option value="sbx-camp-mangrove-02">sbx-camp-mangrove-02 (Niger Delta Mangroves)</option>
                <option value="sbx-camp-sahel-03">sbx-camp-sahel-03 (Great Green Wall)</option>
              </select>
            </div>
            <div>
              <label htmlFor="widget-theme-select" className="block text-xs text-zinc-400">
                Widget Theme
              </label>
              <select
                id="widget-theme-select"
                value={widgetTheme}
                onChange={(e) => setWidgetTheme(e.target.value as WidgetTheme)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                <option value="forest">Forest</option>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-zinc-300">Copy-Paste Iframe Snippet</div>
            <pre
              data-testid="widget-embed-snippet"
              className="overflow-x-auto rounded-xl bg-zinc-950 p-3 font-mono text-xs text-emerald-300"
            >
              {iframeEmbedSnippet}
            </pre>
          </div>
        </section>
      )}

      {/* Tab 4: Webhooks & Signature Tester */}
      {activeTab === "webhooks" && (
        <section aria-label="Webhook Sandbox Simulator" className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-base font-semibold">Webhook Subscription & HMAC-SHA256 Tester</h3>
          <p className="text-xs text-zinc-400">
            Test receiving real-time campaign events signed with <code>X-Fundable-Signature</code>.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="webhook-url-input" className="block text-xs text-zinc-400">
                Destination Webhook URL
              </label>
              <input
                id="webhook-url-input"
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="webhook-event-select" className="block text-xs text-zinc-400">
                Simulated Event Type
              </label>
              <select
                id="webhook-event-select"
                value={selectedWebhookEvent}
                onChange={(e) => setSelectedWebhookEvent(e.target.value as PublicWebhookEventType)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                {PUBLIC_WEBHOOK_EVENTS.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTriggerWebhookTest}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400"
          >
            Trigger Signed Sandbox Webhook
          </button>
        </section>
      )}
    </div>
  );
}
