/**
 * Types for the real-time backer geographic heat map (Issue #1339).
 *
 * Privacy-preserving: data is aggregated at country/region level only.
 * No backer PII or raw IP addresses are stored or returned.
 */

/**
 * ISO 3166-1 alpha-2 country code (e.g. "US", "NG", "DE").
 */
export type CountryCode = string;

/** Pledge tier label used as a filter dimension. */
export type TierLabel = string;

export interface BackerGeoDataPoint {
  /** ISO 3166-1 alpha-2 country code. */
  countryCode: CountryCode;
  /** Human-readable country name. */
  countryName: string;
  /** Total number of unique backers from this country. */
  backerCount: number;
  /** Total XLM pledged (as string to avoid floating-point loss). */
  totalPledgedXlm: string;
  /** Percentage of all backers from this country (0-100). */
  sharePercent: number;
}

export interface BackerGeoHeatMapResult {
  campaignId: string;
  /** Aggregated data points, one per country, sorted by backerCount desc. */
  data: BackerGeoDataPoint[];
  /** Applied filters used to compute this snapshot. */
  filters: {
    tierLabel: TierLabel | null;
    fromDate: string | null;
    toDate: string | null;
  };
  /** ISO-8601 timestamp when this snapshot was generated. */
  generatedAt: string;
  /** Total backer count across all countries (after filters). */
  totalBackers: number;
}

/** Input for recording a single anonymised backer pledge event. */
export interface BackerGeoEvent {
  campaignId: string;
  /** ISO 3166-1 alpha-2 country code (resolved server-side; never raw IP). */
  countryCode: CountryCode;
  countryName: string;
  /** Pledge amount in XLM (as string). */
  pledgedXlm: string;
  /** Optional tier label for filtering. */
  tierLabel?: TierLabel;
  /** ISO-8601 timestamp of the pledge event. */
  pledgedAt: string;
}

/** Query filters for the heat-map endpoint. */
export interface BackerGeoQueryFilters {
  tierLabel?: TierLabel | null;
  fromDate?: string | null;
  toDate?: string | null;
}