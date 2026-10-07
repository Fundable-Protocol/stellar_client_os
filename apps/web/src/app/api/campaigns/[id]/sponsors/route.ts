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

// Underwriter configuration for campaign verification insurance
const UNDERWRITER_PARTNERS = [
  { id: "underwriter-carbon-trust", name: "Carbon Trust Verification", coverageRatio: 0.95, premiumRate: 0.025 },
  { id: "underwriter-gold-standard", name: "Gold Standard Foundation", coverageRatio: 0.98, premiumRate: 0.035 },
  { id: "underwriter-verra", name: "Verra Climate Assurance", coverageRatio: 0.9, premiumRate: 0.02 },
] as const;

type UnderwriterPartner = (typeof UNDERWRITER_PARTNERS)[number];

function selectUnderwriter(token: string, amount: number): UnderwriterPartner {
  if (amount >= 10000) {
    return UNDERWRITER_PARTNERS[1];
  }
  if (token.toUpperCase() === "USDT" || token.toUpperCase() === "USDC") {
    return UNDERWRITER_PARTNERS[2];
  }
  return UNDERWRITER_PARTNERS[0];
}

function calculateInsuranceQuote(amount: number, underwriter: UnderwriterPartner) {
  const premium = amount * underwriter.premiumRate;
  const guaranteedCoverage = amount * underwriter.coverageRatio;
  return {
    underwriterId: underwriter.id,
    underwriterName: underwriter.name,
    premium: Number(premium.toFixed(6)),
    guaranteedCoverage: Number(guaranteedCoverage.toFixed(6)),
    coverageRatio: underwriter.coverageRatio,
    status: "active" as const,
    issuedAt: Date.now(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
+) {
  const { id } = await params;
  const campaignSponsors = sponsorsStore.filter((s) => s.campaignId === id || id === "demo" || id === "camp-101");
  const totalInsured = campaignSponsors.reduce((sum, s) => {
    const amountNum = Number(s.amount);
    if (!Number.finite(amountNum)) return sum;
    const underwriter = selectUnderwriter(s.token, amountNum);
    return sum + amountNum * underwriter.coverageRatio;
  }, 0);
  return NextResponse.json({
    campaignId: id,
    total: campaignSponsors.length,
    sponsors: campaignSponsors,
    insurance: {
      partners: UNDERWRITER_PARTNERS.map((u) => ({ id: u.id, name: u.name, coverageRatio: u.coverageRatio })),
      guaranteedCOTotal: Number(totalInsured.toFixed(6)),
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, address, amount, token, message, avatarUrl, insuranceOptIn } = body;

    if (!address || !amount) {
      return NextResponse.json({ error: "Address and amount are required" }, { status: 400 });
    }

    const amountStr = String(amount);
const amountNum = Number(amountStr);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "Amount must be a positive number" }, { status: 400 });
    }

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

    const insurance =
      insuranceOptIn === false
        ? null
        : calculateInsuranceQuote(amountNum, selectUnderwriter(newSponsor.token, amountNum));

    return NextResponse.json(
      { success: true, sponsor: newSponsor, receipt, insurance },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: "Invalid sponsor payload" }, { status: 500 });
  }
}
