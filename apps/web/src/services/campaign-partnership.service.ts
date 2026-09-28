export type NGOServiceType = "LAND_ACCESS" | "PLANTING_LABOR" | "VERIFICATION";

export interface NGOProfile {
  id: string;
  name: string;
  description: string;
  isVerified: boolean;
  services: NGOServiceType[];
  contactEmail?: string;
  walletAddress?: string;
  createdAt: number;
}

export type PartnershipStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "COMPLETED";

export interface PartnershipRequest {
  id: string;
  campaignId: string;
  ngoId: string;
  servicesRequested: NGOServiceType[];
  status: PartnershipStatus;
  proposedTerms?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PartnershipDataSource {
  getNGOs(): Promise<NGOProfile[]>;
  saveNGO(ngo: NGOProfile): Promise<NGOProfile>;
  getPartnershipRequests(campaignId?: string, ngoId?: string): Promise<PartnershipRequest[]>;
  savePartnershipRequest(request: PartnershipRequest): Promise<PartnershipRequest>;
}

export class InMemoryPartnershipDataSource implements PartnershipDataSource {
  private ngos = new Map<string, NGOProfile>();
  private requests = new Map<string, PartnershipRequest>();

  constructor() {
    // Seed some verified NGOs
    this.ngos.set("ngo-1", {
      id: "ngo-1",
      name: "Global Tree Planters",
      description: "Dedicated to restoring forests worldwide.",
      isVerified: true,
      services: ["PLANTING_LABOR", "VERIFICATION"],
      contactEmail: "hello@globaltree.org",
      createdAt: Date.now() - 1000000,
    });
    this.ngos.set("ngo-2", {
      id: "ngo-2",
      name: "Local Lands Initiative",
      description: "Providing protected land for sustainable planting.",
      isVerified: true,
      services: ["LAND_ACCESS"],
      contactEmail: "contact@locallands.org",
      createdAt: Date.now() - 2000000,
    });
  }

  async getNGOs(): Promise<NGOProfile[]> {
    return Array.from(this.ngos.values());
  }

  async saveNGO(ngo: NGOProfile): Promise<NGOProfile> {
    this.ngos.set(ngo.id, ngo);
    return ngo;
  }

  async getPartnershipRequests(campaignId?: string, ngoId?: string): Promise<PartnershipRequest[]> {
    let list = Array.from(this.requests.values());
    if (campaignId) list = list.filter((r) => r.campaignId === campaignId);
    if (ngoId) list = list.filter((r) => r.ngoId === ngoId);
    return list;
  }

  async savePartnershipRequest(request: PartnershipRequest): Promise<PartnershipRequest> {
    this.requests.set(request.id, request);
    return request;
  }
}

let defaultDataSource: PartnershipDataSource | null = null;
export function getPartnershipDataSource(): PartnershipDataSource {
  if (!defaultDataSource) defaultDataSource = new InMemoryPartnershipDataSource();
  return defaultDataSource;
}

export async function requestPartnership(
  campaignId: string,
  ngoId: string,
  servicesRequested: NGOServiceType[],
  proposedTerms?: string,
  dataSource = getPartnershipDataSource()
): Promise<PartnershipRequest> {
  const ngos = await dataSource.getNGOs();
  const ngo = ngos.find((n) => n.id === ngoId);
  if (!ngo) throw new Error("NGO not found");
  if (!ngo.isVerified) throw new Error("Can only partner with verified NGOs");

  // Verify NGO offers requested services
  for (const svc of servicesRequested) {
    if (!ngo.services.includes(svc)) {
      throw new Error(`NGO does not offer requested service: ${svc}`);
    }
  }

  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const request: PartnershipRequest = {
    id,
    campaignId,
    ngoId,
    servicesRequested,
    status: "PENDING",
    proposedTerms,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return dataSource.savePartnershipRequest(request);
}

export async function updatePartnershipStatus(
  requestId: string,
  status: PartnershipStatus,
  dataSource = getPartnershipDataSource()
): Promise<PartnershipRequest> {
  const requests = await dataSource.getPartnershipRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) throw new Error("Partnership request not found");
  req.status = status;
  req.updatedAt = Date.now();
  return dataSource.savePartnershipRequest(req);
}
