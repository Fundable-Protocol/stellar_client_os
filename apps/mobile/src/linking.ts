/**
 * Deep link configuration for the mobile app. Mirrors the web routes served
 * by apps/web (see apps/web/src/lib/deep-links.ts) and is shaped for React
 * Navigation's `linking` prop.
 */
export const LINK_HOSTS = ["fundable.stellar"] as const;

export const linking = {
  prefixes: [
    "fundable://",
    ...LINK_HOSTS.map((host) => `https://${host}`),
  ],
  config: {
    screens: {
      CampaignDetail: "campaigns/:id",
      BackerDashboard: "dashboard",
      CreatorDashboard: "creators/:address",
    },
  },
};

export type DeepLinkTarget =
  | { screen: "CampaignDetail"; params: { id: string } }
  | { screen: "BackerDashboard"; params?: undefined }
  | { screen: "CreatorDashboard"; params: { address: string } };

const RESERVED_CAMPAIGN_SEGMENTS = new Set([
  "compare",
  "create",
  "invite",
  "marketplace",
  "planting-sites",
  "toolkit",
]);

/** Resolves an incoming universal/app/custom-scheme URL to a screen. */
export function resolveDeepLink(url: string): DeepLinkTarget | null {
  const match = /^(?:fundable:\/\/|https:\/\/[^/]+\/)([^?#]*)/.exec(url);
  if (!match) return null;
  const [root, second, ...rest] = match[1].split("/").filter(Boolean);

  if (root === "campaigns" && second && !RESERVED_CAMPAIGN_SEGMENTS.has(second)) {
    return { screen: "CampaignDetail", params: { id: second } };
  }
  if (root === "dashboard" && !second) return { screen: "BackerDashboard" };
  if (root === "creators" && second && rest.length === 0) {
    return { screen: "CreatorDashboard", params: { address: second } };
  }
  return null;
}
