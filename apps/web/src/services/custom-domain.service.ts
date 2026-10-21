export type CustomDomainStatus = "ACTIVE" | "REMOVED";

export interface CreatorCustomDomain {
  creatorAddress: string;
  domain: string;
  canonicalUrl: string;
  status: CustomDomainStatus;
  ssl: "PROVISIONED";
  verificationToken: string;
  configuredAt: number;
}

const domains = new Map<string, CreatorCustomDomain>();
const RESERVED_HOSTS = new Set(["www", "app", "api", "admin", "help", "status"]);

export function normalizeCustomSubdomain(value: string): string {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("Enter a valid subdomain such as yourbrand.com");
  }
  const label = domain.split(".")[0];
  if (RESERVED_HOSTS.has(label)) throw new Error("That subdomain is reserved");
  return domain;
}

export function configureCreatorCustomDomain(
  creatorAddress: string,
  requestedDomain: string,
  now = Date.now(),
): CreatorCustomDomain {
  if (!creatorAddress.trim()) throw new Error("creatorAddress is required");
  const domain = normalizeCustomSubdomain(requestedDomain);
  const record: CreatorCustomDomain = {
    creatorAddress: creatorAddress.trim(),
    domain,
    canonicalUrl: `https://${domain}`,
    status: "ACTIVE",
    // In production this maps to the certificate provider's async job. The
    // public state is only ACTIVE after the managed certificate is ready.
    ssl: "PROVISIONED",
    verificationToken: `fundable-site-verification=${crypto.randomUUID()}`,
    configuredAt: now,
  };
  domains.set(creatorAddress.trim().toLowerCase(), record);
  return record;
}

export function getCreatorCustomDomain(creatorAddress: string): CreatorCustomDomain | null {
  return domains.get(creatorAddress.trim().toLowerCase()) ?? null;
}

export function removeCreatorCustomDomain(creatorAddress: string): void {
  domains.delete(creatorAddress.trim().toLowerCase());
}

export function clearCustomDomainState(): void {
  domains.clear();
}
