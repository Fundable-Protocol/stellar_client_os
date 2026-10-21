/**
 * Campaign SEO helpers (#1222): length guidance, validation and the effective
 * title/description/image used for the page <head> and the editor previews.
 */

/** Recommended ranges: search engines truncate titles ~60 and descriptions ~160 chars. */
export const SEO_TITLE_RANGE = { min: 30, max: 60 } as const;
export const SEO_DESCRIPTION_RANGE = { min: 70, max: 160 } as const;

/** Hard limits accepted by the API; anything between max and hard is allowed but flagged. */
export const SEO_TITLE_HARD_LIMIT = 120;
export const SEO_DESCRIPTION_HARD_LIMIT = 320;
export const SEO_IMAGE_URL_HARD_LIMIT = 2048;

export type SeoLengthStatus = "empty" | "short" | "good" | "long";

export interface CampaignSeoInput {
  title?: string | null;
  description?: string | null;
  ogImageUrl?: string | null;
}

export interface CampaignSeoSettings {
  title?: string;
  description?: string;
  ogImageUrl?: string;
}

export interface CampaignSeoFallback {
  name: string;
  description?: string;
  imageUrl?: string;
}

export interface ResolvedCampaignSeo {
  title: string;
  description: string;
  ogImageUrl?: string;
}

export function getSeoLengthStatus(length: number, range: { min: number; max: number }): SeoLengthStatus {
  if (length === 0) return "empty";
  if (length > range.max) return "long";
  if (length < range.min) return "short";
  return "good";
}

/** Collapse whitespace so counts match what search engines display. */
export function normalizeSeoText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Truncate at a word boundary with an ellipsis, as search results do. */
export function truncateForPreview(text: string, max: number): string {
  const normalized = normalizeSeoText(text);
  if (normalized.length <= max) return normalized;
  const slice = normalized.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

export function isValidSeoImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type SeoValidationResult =
  | { ok: true; value: CampaignSeoSettings }
  | { ok: false; errors: Partial<Record<keyof CampaignSeoSettings, string>> };

/** Validate and normalize creator input. Empty strings clear a field. */
export function validateCampaignSeo(input: CampaignSeoInput): SeoValidationResult {
  const errors: Partial<Record<keyof CampaignSeoSettings, string>> = {};
  const title = normalizeSeoText(input.title);
  const description = normalizeSeoText(input.description);
  const ogImageUrl = (input.ogImageUrl ?? "").trim();

  if (title.length > SEO_TITLE_HARD_LIMIT) {
    errors.title = `title must be ${SEO_TITLE_HARD_LIMIT} characters or fewer`;
  }
  if (description.length > SEO_DESCRIPTION_HARD_LIMIT) {
    errors.description = `description must be ${SEO_DESCRIPTION_HARD_LIMIT} characters or fewer`;
  }
  if (ogImageUrl && (ogImageUrl.length > SEO_IMAGE_URL_HARD_LIMIT || !isValidSeoImageUrl(ogImageUrl))) {
    errors.ogImageUrl = "ogImageUrl must be an absolute http(s) URL";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...(title && { title }),
      ...(description && { description }),
      ...(ogImageUrl && { ogImageUrl }),
    },
  };
}

/** Creator overrides win; otherwise fall back to the campaign's own copy. */
export function resolveCampaignSeo(
  settings: CampaignSeoSettings | null | undefined,
  fallback: CampaignSeoFallback,
): ResolvedCampaignSeo {
  return {
    title: settings?.title || normalizeSeoText(fallback.name),
    description:
      settings?.description ||
      truncateForPreview(fallback.description ?? "", SEO_DESCRIPTION_RANGE.max),
    ogImageUrl: settings?.ogImageUrl || fallback.imageUrl || undefined,
  };
}
