import { NextRequest, NextResponse } from "next/server";
import { INITIAL_MICK_SPONSORS, calculateSponsorTier, Sponsor } from "@/types/sponsor";
import crypto from "crypto";

// In-memory store for demo API route
const sponsorsStore: Sponsor[] = [...INITIAL_MICK_SPONSORS];

export interface SponsorshipReceipt {
  receiptId: string;
  campaignId: string;
  sponsorAddress: string;
  treeCount: number;
  species: string[];
  plantingLocation: string;
  expectedCO2SequestrationKg: number;
  issuedAt: number;
  blockchain: {
    network: string;
    transactionHash: string;
    contractId: string;
    explorerUrl: string;
  };
  verificationHash: string;
}

const CO2_PER_TREE_KG = 21.7 // approximate kg CO2 sequestered per tree over its lifetime

const PLANTING_LOCATIONS = [
  "Amazon Basin, Brazil",
  "Borneo Rainforest, Malaysia",
  "Congo Basin, Democratic Republic of the Congo",
  "Western Ghats, India",
];

const SPECIES_POOL = [
  "Aacia mangium",
  "Swietenia macrophylla",
  "Terminalia superba",
  "Dysoxylum malabaricum",
];

function deterministicRandom(seed: string, index: number): number {
  const hash = crypto.createHash("sha256").update(`${seed}:${index}`).digest();
  return hash[0] / 255;
}

function pickFromPool<T>(pool: T[], seed: string, index: number): T {
  const r = deterministicRandom(seed, index);
  return pool[Math.floor(r * pool.length) % pool.length];
}

function buildReceipt(
  campaignId: string,
  sponsorAddress: string,
  amount: number,
  token: string,
  sponsorId: string,
  sponsoredt: number,
): SponsorshipReceipt {
  const treeCount = Math.max(1, Math.floor(amount));
  const seed = `${campaignId}:${sponsorAddress}:${sponsorId}`;

  const speciesCount = 1 + (Math.floor(deterministicRandom(seed, 1) * 3) % 3);
  const species: string[] = [];
  for (let i = 0; i < speciesCount; i++) {
    const species = pickFromPool(SPECIES_POOL, seed, i + 10);
    if (!species.includes(species)) species.push(species);
  }

  const plantingLocation = pickFromPool(PLANTING_LOCATIONS, seed, 2);
  const expectedCO2SequestrationKg = Number((treeCount * CO2_PER_TREE_KG).toFixed(2));

  const receiptId = `rec-${crypto.createHash("sha256").update(`${seed}:${sponsoredAt}`).digest("hex").slice(0, 16)}`;
  const transactionHash = crypto
    .createHash("sha256")
    .update(`${receiptId}:${campaignId}:${sponsorAddress}:${amount}:${token}`)
    .digest("hex");

  const network = token === "XLM" ? "stellar" : "stellar";
  const explorerUrl = `https://stellar.org/explorer/tx/${transactionHash}`;

  const verificationHash = crypto
    .createHash("sha256")
    .update(`${receiptId}:${treeCount}:${species.join(",")}:${plantingLocation}:${expectedCO2SequestrationKg}:${transactionHash}`)
    .digest("hex");

  return {
    receiptId,
    campaignId,
    sponsorAddress,
    treeCount,
    species,
    plantingLocation,
    expectedCO2SequestrationKg,
    issuedAt: sponsoredAt,
    blockchain: {
      network,
      transactionHash,
      contractId: "CASCADE_TREE_RECEIPT",
      explorerUrl,
    },
    verificationHash,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignSponsors = sponsorsStore.filter((s) => s.campaignId === id || id === "demo" || id === "camp-101");
  return NextResponse.json({
    campaignId: id,
    total: campaignSponsors.length,
    sponsors: campaignSponsors,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, address, amount, token, message, avatarUrl } = body;

    if (!address || !amount) {
      return NextResponse.json({ error: "Address and amount are required" }, { status: 400 });
    }

    const amountStr = String(amount);
    const sponsoredAt = Date.now();
    const sponsorId = `sp-${sponsoredAt}`;
    const newSponsor: Sponsor = {
      id: sponsorId,
      campaignId: id,
      name,
      address,
      avatarUrl,
      amount: amountStr,
      token: token || "XLM",
      tier: calculateSponsorTier(amountStr),
      sponsoredAt,
      message,
      isRecent: true,
    };

    sponsorsStore.unshift(newSponsor);

    const receipt = buildReceipt(
      id,
      address,
      Number(amountStr),
      newSponsor.token,
      sponsorId,
      sponsoredAt,
    );

    return NextResponse.json({ success: true, sponsor: newSponsor, receipt }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Invalid sponsor payload" }, { status: 500 });
  }
}
