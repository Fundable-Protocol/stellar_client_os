/**
 * Universal link (iOS) / App Link (Android) configuration.
 *
 * Deep-linked web routes:
 *   /campaigns/:id        -> campaign detail
 *   /dashboard            -> backer dashboard
 *   /creators/:address    -> creator dashboard
 */

/** Static /campaigns/* routes that are NOT campaign detail pages. */
const RESERVED_CAMPAIGN_SEGMENTS = new Set([
  "compare",
  "create",
  "invite",
  "marketplace",
  "planting-sites",
  "toolkit",
]);

/** URL path patterns the native app should handle (AASA / intent filters). */
export const DEEP_LINK_PATH_PATTERNS = [
  "/campaigns/*",
  "/dashboard",
  "/dashboard/*",
  "/creators/*",
] as const;

export interface DeepLinkConfig {
  appScheme: string;
  iosAppId: string;
  iosTeamId: string;
  iosBundleId: string;
  androidPackage: string;
  androidCertFingerprints: string[];
  iosStoreUrl: string;
  androidStoreUrl: string;
}

export function getDeepLinkConfig(
  env: Record<string, string | undefined> = process.env,
): DeepLinkConfig {
  const iosTeamId = env.NEXT_PUBLIC_IOS_TEAM_ID ?? "";
  const iosBundleId = env.NEXT_PUBLIC_IOS_BUNDLE_ID ?? "com.fundable.stellar";
  const androidPackage =
    env.NEXT_PUBLIC_ANDROID_PACKAGE ?? "com.fundable.stellar";
  return {
    appScheme: env.NEXT_PUBLIC_APP_SCHEME ?? "fundable",
    iosAppId: env.NEXT_PUBLIC_IOS_APP_ID ?? "",
    iosTeamId,
    iosBundleId,
    androidPackage,
    androidCertFingerprints: (env.ANDROID_CERT_SHA256_FINGERPRINTS ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean),
    iosStoreUrl: env.NEXT_PUBLIC_IOS_APP_STORE_URL ?? "",
    androidStoreUrl:
      env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL ??
      `https://play.google.com/store/apps/details?id=${androidPackage}`,
  };
}

/** Builds the apple-app-site-association document. */
export function buildAppleAppSiteAssociation(config: DeepLinkConfig) {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [`${config.iosTeamId}.${config.iosBundleId}`],
          components: DEEP_LINK_PATH_PATTERNS.map((path) => ({ "/": path })),
        },
      ],
    },
  };
}

/** Builds the Android Digital Asset Links (assetlinks.json) document. */
export function buildAssetLinks(config: DeepLinkConfig) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: config.androidPackage,
        sha256_cert_fingerprints: config.androidCertFingerprints,
      },
    },
  ];
}

/**
 * Maps a web path to the equivalent custom-scheme URL, or null when the path
 * is not deep-linkable.
 */
export function toAppUrl(
  pathname: string,
  search = "",
  scheme = "fundable",
): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const [root, second, ...rest] = segments;

  if (root === "campaigns" && second && !RESERVED_CAMPAIGN_SEGMENTS.has(second)) {
    return `${scheme}://campaigns/${second}${rest.length ? `/${rest.join("/")}` : ""}${search}`;
  }
  if (root === "dashboard" && !second) {
    return `${scheme}://dashboard${search}`;
  }
  if (root === "creators" && second && rest.length === 0) {
    return `${scheme}://creators/${second}${search}`;
  }
  return null;
}

export type MobilePlatform = "ios" | "android" | null;

export function detectMobilePlatform(userAgent: string): MobilePlatform {
  if (/android/i.test(userAgent)) return "android";
  // iPadOS 13+ reports as Macintosh; callers may pass touch hints separately.
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return null;
}
