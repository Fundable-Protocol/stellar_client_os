/**
 * Campaign Partnership Marketplace — connect campaigns with verified NGOs (v2)
 *
 * Issue #887: NGOs offer planting services (land access, planting labor,
 * verification) that campaigns can request for a partnership. This module is
 * the backend for that marketplace:
 *
 *  - **NGO registry with an onboarding + review workflow.** A new NGO registers
 *    in `PENDING` status; an operator reviews it and moves it to `VERIFIED` or
 *    `REJECTED`. Only verified NGOs can be partnered with.
 *  - **Directory.** `listNGOs()` supports filtering by free-text query, service
 *    type, country and verification status (verified-only by default).
 *  - **Partnership request lifecycle.** `PENDING → ACCEPTED | REJECTED |
 *    CANCELED` and `ACCEPTED → COMPLETED`, with service-coverage validation and
 *    duplicate-active-request prevention.
 *
 * Data is stored behind an injectable `PartnershipDataSource` (in-memory by
 * default), so service and route tests exercise the same code paths the
 * deployed process uses.
 */

/** Services an NGO may offer, mirroring the on-chain planting workflow. */
export const NGO_SERVICE_TYPES = ["LAND_ACCESS", "PLANTING_LABOR", "VERIFICATION"] as const;

export type NGOServiceType = (typeof NGO_SERVICE_TYPES)[number];

export type NGOVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface NGOProfile {
  id: string;
  name: string;
  description: string;
  services: NGOServiceType[];
  /** Public-facing verified flag (true when `verificationStatus === "VERIFIED"`). */
  isVerified: boolean;
  verificationStatus: NGOVerificationStatus;
  country?: string;
  website?: string;
  contactEmail?: string;
  walletAddress?: string;
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type PartnershipStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "COMPLETED" | "CANCELED";

export const PARTNERSHIP_STATUSES: readonly PartnershipStatus[] = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "COMPLETED",
  "CANCELED",
];

export interface PartnershipRequest {
  id: string;
  campaignId: string;
  ngoId: string;
  ngoName: string;
  servicesRequested: NGOServiceType[];
  status: PartnershipStatus;
  proposedTerms?: string;
  /** Wallet/actor that initiated the request (defaults to the campaign creator). */
  initiatedBy?: string;
  /** Actor that last transitioned the request status. */
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PartnershipDataSource {
  listNGOs(): Promise<NGOProfile[]>;
  getNGOById(id: string): Promise<NGOProfile | undefined>;
  saveNGO(ngo: NGOProfile): Promise<NGOProfile>;
  listPartnershipRequests(): Promise<PartnershipRequest[]>;
  getPartnershipRequestById(id: string): Promise<PartnershipRequest | undefined>;
  savePartnershipRequest(request: PartnershipRequest): Promise<PartnershipRequest>;
}

export class InMemoryPartnershipDataSource implements PartnershipDataSource {
  private readonly ngos = new Map<string, NGOProfile>();
  private readonly requests = new Map<string, PartnershipRequest>();

  constructor() {
    const now = Date.now();
    this.storeNGO({
      id: "ngo-1",
      name: "Global Tree Planters",
      description: "Dedicated to restoring forests worldwide.",
      services: ["PLANTING_LABOR", "VERIFICATION"],
      isVerified: true,
      verificationStatus: "VERIFIED",
      country: "Kenya",
      website: "https://globaltree.example.org",
      contactEmail: "hello@globaltree.example.org",
      reviewedBy: "seed",
      reviewedAt: now - 1_000_000,
      createdAt: now - 1_000_000,
      updatedAt: now - 1_000_000,
    });
    this.storeNGO({
      id: "ngo-2",
      name: "Local Lands Initiative",
      description: "Providing protected land for sustainable planting.",
      services: ["LAND_ACCESS"],
      isVerified: true,
      verificationStatus: "VERIFIED",
      country: "Ghana",
      contactEmail: "contact@locallands.example.org",
      reviewedBy: "seed",
      reviewedAt: now - 2_000_000,
      createdAt: now - 2_000_000,
      updatedAt: now - 2_000_000,
    });
    this.storeNGO({
      id: "ngo-3",
      name: "Coastal Conservation Unit",
      description: "Mangrove restoration on the West African coast.",
      services: ["LAND_ACCESS", "PLANTING_LABOR"],
      isVerified: false,
      verificationStatus: "PENDING",
      country: "Nigeria",
      contactEmail: "apply@coastalconservation.example.org",
      createdAt: now - 500_000,
      updatedAt: now - 500_000,
    });
  }

  private storeNGO(ngo: NGOProfile): void {
    this.ngos.set(ngo.id, ngo);
  }

  async listNGOs(): Promise<NGOProfile[]> {
    return Array.from(this.ngos.values());
  }

  async getNGOById(id: string): Promise<NGOProfile | undefined> {
    return this.ngos.get(id);
  }

  async saveNGO(ngo: NGOProfile): Promise<NGOProfile> {
    this.storeNGO(ngo);
    return ngo;
  }

  async listPartnershipRequests(): Promise<PartnershipRequest[]> {
    return Array.from(this.requests.values());
  }

  async getPartnershipRequestById(id: string): Promise<PartnershipRequest | undefined> {
    return this.requests.get(id);
  }

  async savePartnershipRequest(request: PartnershipRequest): Promise<PartnershipRequest> {
    this.requests.set(request.id, request);
    return request;
  }
}

let defaultDataSource: PartnershipDataSource | null = null;

export function getPartnershipDataSource(): PartnershipDataSource {
  defaultDataSource ??= new InMemoryPartnershipDataSource();
  return defaultDataSource;
}

export function setPartnershipDataSource(dataSource: PartnershipDataSource): void {
  defaultDataSource = dataSource;
}

export type PartnershipErrorCode =
  | "INVALID_SERVICES"
  | "NGO_NOT_FOUND"
  | "NGO_NOT_VERIFIED"
  | "SERVICE_NOT_OFFERED"
  | "INVALID_VERDICT"
  | "PARTNERSHIP_NOT_FOUND"
  | "INVALID_STATUS"
  | "INVALID_TRANSITION"
  | "DUPLICATE_ACTIVE_PARTNERSHIP";

export class PartnershipError extends Error {
  constructor(message: string, public readonly code: PartnershipErrorCode) {
    super(message);
    this.name = "PartnershipError";
  }
}

export const PARTNERSHIP_ERROR_STATUS: Record<PartnershipErrorCode, number> = {
  INVALID_SERVICES: 400,
  NGO_NOT_FOUND: 404,
  NGO_NOT_VERIFIED: 409,
  SERVICE_NOT_OFFERED: 400,
  INVALID_VERDICT: 400,
  PARTNERSHIP_NOT_FOUND: 404,
  INVALID_STATUS: 400,
  INVALID_TRANSITION: 409,
  DUPLICATE_ACTIVE_PARTNERSHIP: 409,
};

export interface NGOFilters {
  /** Case-insensitive match on name, description and country. */
  q?: string;
  service?: NGOServiceType;
  country?: string;
  /** Omit to show verified NGOs only; pass "ALL" for every status. */
  status?: NGOVerificationStatus | "ALL";
}

function matchesFilter(ngo: NGOProfile, filter: NGOFilters): boolean {
  if (filter.status === undefined && ngo.verificationStatus !== "VERIFIED") return false;
  if (filter.status && filter.status !== "ALL" && ngo.verificationStatus !== filter.status) {
    return false;
  }
  if (filter.service && !ngo.services.includes(filter.service)) return false;
  if (filter.country && ngo.country?.toLowerCase() !== filter.country.toLowerCase()) return false;
  if (filter.q) {
    const q = filter.q.toLowerCase();
    if (![ngo.name, ngo.description, ngo.country].some((v) => v?.toLowerCase().includes(q))) {
      return false;
    }
  }
  return true;
}

/** Newest first — a directory puts fresh NGOs at the top. */
export function listNGOs(
  filter: NGOFilters = {},
  dataSource = getPartnershipDataSource(),
): Promise<NGOProfile[]> {
  return dataSource.listNGOs().then((ngos) =>
    ngos
      .filter((ngo) => matchesFilter(ngo, filter))
      .sort((a, b) => b.createdAt - a.createdAt),
  );
}

export async function getNGOById(
  id: string,
  dataSource = getPartnershipDataSource(),
): Promise<NGOProfile | undefined> {
  return dataSource.getNGOById(id);
}

export interface NGORegistrationInput {
  name: string;
  description: string;
  services: NGOServiceType[];
  country?: string;
  website?: string;
  contactEmail?: string;
  walletAddress?: string;
}

/**
 * Register a new NGO. The profile starts in `PENDING` status and only becomes
 * partnerable after an operator verifies it via `reviewNGO`.
 */
export async function registerNGO(
  input: NGORegistrationInput,
  dataSource = getPartnershipDataSource(),
): Promise<NGOProfile> {
  if (
    !input.name.trim() ||
    !input.description.trim() ||
    !Array.isArray(input.services) ||
    input.services.length === 0 ||
    input.services.some((s) => !NGO_SERVICE_TYPES.includes(s))
  ) {
    throw new PartnershipError("name, description and at least one valid service are required", "INVALID_SERVICES");
  }

  const now = Date.now();
  const ngo: NGOProfile = {
    id: `ngo-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    services: input.services,
    isVerified: false,
    verificationStatus: "PENDING",
    country: input.country?.trim() || undefined,
    website: input.website?.trim() || undefined,
    contactEmail: input.contactEmail?.trim() || undefined,
    walletAddress: input.walletAddress?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  return dataSource.saveNGO(ngo);
}

/**
 * Review a pending NGO application. Only `VERIFIED` or `REJECTED` verdicts are
 * allowed; the reviewer identity is recorded for the audit trail.
 */
export async function reviewNGO(
  id: string,
  verdict: Extract<NGOVerificationStatus, "VERIFIED" | "REJECTED">,
  reviewer: string,
  dataSource = getPartnershipDataSource(),
): Promise<NGOProfile> {
  if (verdict !== "VERIFIED" && verdict !== "REJECTED") {
    throw new PartnershipError('verdict must be "VERIFIED" or "REJECTED"', "INVALID_VERDICT");
  }
  const ngo = await dataSource.getNGOById(id);
  if (!ngo) throw new PartnershipError("NGO not found", "NGO_NOT_FOUND");

  const updated = {
    ...ngo,
    isVerified: verdict === "VERIFIED",
    verificationStatus: verdict,
    reviewedBy: reviewer,
    reviewedAt: Date.now(),
    updatedAt: Date.now(),
  };
  return dataSource.saveNGO(updated);
}

export interface PartnershipFilters {
  campaignId?: string;
  ngoId?: string;
  status?: PartnershipStatus;
}

/** Newest first, so campaigns see the latest requests on top. */
export async function listPartnerships(
  filter: PartnershipFilters = {},
  dataSource = getPartnershipDataSource(),
): Promise<PartnershipRequest[]> {
  const requests = await dataSource.listPartnershipRequests();
  return requests
    .filter(
      (r) =>
        (filter.campaignId === undefined || r.campaignId === filter.campaignId) &&
        (filter.ngoId === undefined || r.ngoId === filter.ngoId) &&
        (filter.status === undefined || r.status === filter.status),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getPartnershipRequest(
  id: string,
  dataSource = getPartnershipDataSource(),
): Promise<PartnershipRequest | undefined> {
  return dataSource.getPartnershipRequestById(id);
}

const ACTIVE_STATUSES: readonly PartnershipStatus[] = ["PENDING", "ACCEPTED"];

/**
 * Create a partnership request from a campaign to an NGO. The NGO must exist,
 * be verified, and offer every requested service. Duplicate active requests
 * between the same campaign and NGO are rejected.
 */
export async function requestPartnership(
  campaignId: string,
  ngoId: string,
  servicesRequested: NGOServiceType[],
  proposedTerms?: string,
  initiatedBy?: string,
  dataSource = getPartnershipDataSource(),
): Promise<PartnershipRequest> {
  if (
    !Array.isArray(servicesRequested) ||
    servicesRequested.length === 0 ||
    servicesRequested.some((s) => !NGO_SERVICE_TYPES.includes(s))
  ) {
    throw new PartnershipError("servicesRequested must contain at least one valid service", "INVALID_SERVICES");
  }

  const ngo = await dataSource.getNGOById(ngoId);
  if (!ngo) throw new PartnershipError("NGO not found", "NGO_NOT_FOUND");
  if (!ngo.isVerified) throw new PartnershipError("Can only partner with verified NGOs", "NGO_NOT_VERIFIED");

  for (const service of servicesRequested) {
    if (!ngo.services.includes(service)) {
      throw new PartnershipError(`NGO does not offer requested service: ${service}`, "SERVICE_NOT_OFFERED");
    }
  }

  const existing = await dataSource.listPartnershipRequests();
  if (
    existing.some(
      (r) => r.campaignId === campaignId && r.ngoId === ngoId && ACTIVE_STATUSES.includes(r.status),
    )
  ) {
    throw new PartnershipError("An active partnership request already exists for this campaign and NGO", "DUPLICATE_ACTIVE_PARTNERSHIP");
  }

  const now = Date.now();
  const request: PartnershipRequest = {
    id: `req-${now}-${Math.random().toString(36).slice(2, 7)}`,
    campaignId,
    ngoId,
    ngoName: ngo.name,
    servicesRequested,
    status: "PENDING",
    proposedTerms: proposedTerms?.trim() || undefined,
    initiatedBy,
    createdAt: now,
    updatedAt: now,
  };
  return dataSource.savePartnershipRequest(request);
}

const VALID_TRANSITIONS: Record<PartnershipStatus, readonly PartnershipStatus[]> = {
  PENDING: ["ACCEPTED", "REJECTED", "CANCELED"],
  ACCEPTED: ["COMPLETED", "CANCELED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELED: [],
};

/**
 * Transition a partnership request to a new status. Only forward transitions
 * defined by the request lifecycle are allowed; terminal statuses
 * (`COMPLETED`/`REJECTED`/`CANCELED`) can never move again.
 */
export async function updatePartnershipStatus(
  requestId: string,
  status: PartnershipStatus,
  dataSource = getPartnershipDataSource(),
  updatedBy?: string,
): Promise<PartnershipRequest> {
  if (!PARTNERSHIP_STATUSES.includes(status)) {
    throw new PartnershipError("status must be a valid partnership status", "INVALID_STATUS");
  }

  const request = await dataSource.getPartnershipRequestById(requestId);
  if (!request) throw new PartnershipError("Partnership request not found", "PARTNERSHIP_NOT_FOUND");

  if (!VALID_TRANSITIONS[request.status].includes(status)) {
    throw new PartnershipError(
      `Cannot transition partnership from ${request.status} to ${status}`,
      "INVALID_TRANSITION",
    );
  }

  const updated = { ...request, status, updatedBy, updatedAt: Date.now() };
  return dataSource.savePartnershipRequest(updated);
}