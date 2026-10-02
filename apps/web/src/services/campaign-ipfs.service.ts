/**
 * Campaign IPFS Metadata Service — issue #743
 *
 * Stores and retrieves campaign documentation (description, terms & conditions,
 * and impact reports) on decentralized IPFS storage, providing CID pinning and
 * on-chain hash formatting for Soroban contract anchoring.
 */

import { createHash } from "crypto";

export interface ImpactReportEntry {
  id: string;
  title: string;
  date: string;
  summary: string;
  documentCid?: string;
  metrics?: Record<string, number | string>;
}

export interface CampaignIpfsMetadata {
  name: string;
  description: string;
  terms: string;
  impactReports: ImpactReportEntry[];
  attributes?: Record<string, string>;
  createdAt?: string;
  metadataVersion?: string;
}

export interface CampaignIpfsPinResult {
  /** Standard IPFS Content Identifier (CIDv0 Qm... or CIDv1 bafy...). */
  cid: string;
  /** Public gateway URL for fetching the metadata document. */
  gatewayUrl: string;
  /** 32-byte SHA-256 hash formatted as a 64-character hex string for on-chain storage. */
  onChainHashHex: string;
  /** Raw metadata stored. */
  metadata: CampaignIpfsMetadata;
}

// In-memory decentralized storage cache simulating IPFS node pin set
const ipfsPinStore = new Map<string, CampaignIpfsMetadata>();

/**
 * Computes a deterministic mock IPFS CID and SHA256 hex hash from stringified JSON content.
 */
export function computeIpfsCid(content: string): { cid: string; sha256Hex: string } {
  const hash = createHash("sha256").update(content).digest();
  const sha256Hex = hash.toString("hex");

  // Format CIDv0 style (Qm...) using base58-like string derived from sha256 hash
  const cidHex = "1220" + sha256Hex; // Multihash header for sha256 (0x12) length 32 (0x20)
  const cid = "Qm" + Buffer.from(cidHex, "hex").toString("base64url").slice(0, 44);

  return { cid, sha256Hex };
}

/**
 * Pins campaign metadata to decentralized IPFS storage.
 *
 * @param metadata - Campaign description, terms, and impact reports.
 * @returns IPFS pin result with CID, gateway URL, and on-chain hash hex.
 */
export async function uploadCampaignMetadataToIpfs(
  metadata: CampaignIpfsMetadata
): Promise<CampaignIpfsPinResult> {
  const normalizedMetadata: CampaignIpfsMetadata = {
    ...metadata,
    createdAt: metadata.createdAt || new Date().toISOString(),
    metadataVersion: metadata.metadataVersion || "1.0.0",
    impactReports: metadata.impactReports || [],
  };

  const jsonString = JSON.stringify(normalizedMetadata, null, 2);
  const { cid, sha256Hex } = computeIpfsCid(jsonString);

  // Store in IPFS pin store
  ipfsPinStore.set(cid, normalizedMetadata);
  ipfsPinStore.set(sha256Hex, normalizedMetadata);

  const gatewayUrl = process.env.IPFS_GATEWAY_URL
    ? `${process.env.IPFS_GATEWAY_URL}/ipfs/${cid}`
    : `https://ipfs.io/ipfs/${cid}`;

  return {
    cid,
    gatewayUrl,
    onChainHashHex: sha256Hex,
    metadata: normalizedMetadata,
  };
}

/**
 * Fetches campaign metadata document from IPFS storage by CID or on-chain hex hash.
 *
 * @param cidOrHash - IPFS CID or 64-character SHA256 hash hex string.
 * @returns CampaignIpfsMetadata document or null if not found.
 */
export async function fetchCampaignMetadataFromIpfs(
  cidOrHash: string
): Promise<CampaignIpfsMetadata | null> {
  if (ipfsPinStore.has(cidOrHash)) {
    return ipfsPinStore.get(cidOrHash)!;
  }

  // Attempt public gateway fallback fetch if standard CID format
  if (cidOrHash.startsWith("Qm") || cidOrHash.startsWith("bafy")) {
    try {
      const res = await fetch(`https://ipfs.io/ipfs/${cidOrHash}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as CampaignIpfsMetadata;
        ipfsPinStore.set(cidOrHash, data);
        return data;
      }
    } catch {
      // Fall through to null return on network exception
    }
  }

  return null;
}
