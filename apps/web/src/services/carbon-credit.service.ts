import { backersService } from "./campaign-backers.service";
import { formatTokenAmount, parseTokenAmount, type BackerContribution } from "@/types/campaign-backers";

export type CarbonIssuanceStatus = "ready" | "issued";

export interface CarbonCreditIssuance {
  campaignId: string;
  tokenCode: string;
  network: "testnet" | "mainnet";
  verifiedTonnes: string;
  totalCredits: string;
  status: CarbonIssuanceStatus;
  issuanceId: string;
  mintTxHash: string;
  methodologyHash?: string;
  issuedAt: number;
}

export interface CarbonCreditClaim {
  campaignId: string;
  sponsorAddress: string;
  amount: string;
  claimTxHash: string;
  claimedAt: number;
}

function hashId(prefix: string, value: string): string {
  return `${prefix}-${value.replace(/[^a-zA-Z0-9-]/g, "-")}-${Date.now()}`;
}

class CarbonCreditService {
  private issuances = new Map<string, CarbonCreditIssuance>();
  private claims = new Map<string, CarbonCreditClaim>();
  private balances = new Map<string, bigint>();

  finalizeIssuance(input: {
    campaignId: string;
    status: string;
    verifiedTonnes: string;
    verifiedTreeCount?: number;
    totalTreeCount?: number;
    network?: "testnet" | "mainnet";
    tokenCode?: string;
    methodologyHash?: string;
    now?: number;
  }): CarbonCreditIssuance {
    const existing = this.issuances.get(input.campaignId);
    if (existing) return { ...existing };
    if (!["COMPLETED", "SUCCESSFUL", "CLAIMED"].includes(input.status)) {
      throw new Error("Carbon credits can only be issued for a completed campaign");
    }
    if (input.totalTreeCount !== undefined && input.verifiedTreeCount !== input.totalTreeCount) {
      throw new Error("All campaign trees must be verified before credits are issued");
    }
    const tonnes = parseTokenAmount(input.verifiedTonnes);
    if (tonnes === null || tonnes <= 0n) throw new Error("verifiedTonnes must be positive");
    const now = input.now ?? Date.now();
    const issuance: CarbonCreditIssuance = {
      campaignId: input.campaignId,
      tokenCode: input.tokenCode ?? "CARBON",
      network: input.network ?? "testnet",
      verifiedTonnes: formatTokenAmount(tonnes),
      totalCredits: formatTokenAmount(tonnes),
      status: "issued",
      issuanceId: hashId("carbon-issuance", input.campaignId),
      mintTxHash: hashId("stellar-mint", input.campaignId),
      methodologyHash: input.methodologyHash,
      issuedAt: now,
    };
    this.issuances.set(input.campaignId, issuance);
    return { ...issuance };
  }

  getIssuance(campaignId: string): CarbonCreditIssuance | undefined {
    const issuance = this.issuances.get(campaignId);
    return issuance ? { ...issuance } : undefined;
  }

  claimForSponsor(campaignId: string, sponsorAddress: string, now = Date.now()): CarbonCreditClaim {
    const issuance = this.issuances.get(campaignId);
    if (!issuance) throw new Error("Carbon credit issuance is not ready");
    const key = `${campaignId}:${sponsorAddress.trim().toLowerCase()}`;
    const existing = this.claims.get(key);
    if (existing) return { ...existing };
    const contribution = backersService
      .getContributions(campaignId)
      .find((entry) => entry.backerAddress.trim().toLowerCase() === sponsorAddress.trim().toLowerCase());
    if (!contribution) throw new Error("Sponsor has no contribution for this campaign");
    const total = sumContributions(backersService.getContributions(campaignId));
    const sponsorAmount = parseTokenAmount(contribution.netAmount ?? contribution.amount);
    const supply = parseTokenAmount(issuance.totalCredits);
    if (!sponsorAmount || !supply || total <= 0n) throw new Error("Contribution amounts are invalid");
    const amount = (supply * sponsorAmount) / total;
    if (amount <= 0n) throw new Error("Sponsor allocation is below the minimum credit unit");
    const claim: CarbonCreditClaim = {
      campaignId,
      sponsorAddress: sponsorAddress.trim(),
      amount: formatTokenAmount(amount),
      claimTxHash: hashId("stellar-claim", key),
      claimedAt: now,
    };
    this.claims.set(key, claim);
    const balanceKey = `${issuance.network}:${issuance.tokenCode}:${sponsorAddress.trim().toLowerCase()}`;
    this.balances.set(balanceKey, (this.balances.get(balanceKey) ?? 0n) + amount);
    return { ...claim };
  }

  getClaim(campaignId: string, sponsorAddress: string): CarbonCreditClaim | undefined {
    const claim = this.claims.get(`${campaignId}:${sponsorAddress.trim().toLowerCase()}`);
    return claim ? { ...claim } : undefined;
  }

  getBalance(address: string, network: "testnet" | "mainnet" = "testnet", tokenCode = "CARBON"): string {
    return formatTokenAmount(this.balances.get(`${network}:${tokenCode}:${address.trim().toLowerCase()}`) ?? 0n);
  }

  transfer(input: { from: string; to: string; amount: string; network?: "testnet" | "mainnet"; tokenCode?: string }): string {
    const network = input.network ?? "testnet";
    const tokenCode = input.tokenCode ?? "CARBON";
    const amount = parseTokenAmount(input.amount);
    if (amount === null || amount <= 0n) throw new Error("Transfer amount must be positive");
    const fromKey = `${network}:${tokenCode}:${input.from.trim().toLowerCase()}`;
    const toKey = `${network}:${tokenCode}:${input.to.trim().toLowerCase()}`;
    if ((this.balances.get(fromKey) ?? 0n) < amount) throw new Error("Insufficient carbon credit balance");
    this.balances.set(fromKey, (this.balances.get(fromKey) ?? 0n) - amount);
    this.balances.set(toKey, (this.balances.get(toKey) ?? 0n) + amount);
    return hashId("stellar-transfer", `${fromKey}-${toKey}-${input.amount}`);
  }

  reset(): void {
    this.issuances.clear();
    this.claims.clear();
    this.balances.clear();
  }
}

function sumContributions(contributions: BackerContribution[]): bigint {
  return contributions.reduce((total, contribution) => total + (parseTokenAmount(contribution.netAmount ?? contribution.amount) ?? 0n), 0n);
}

export const carbonCreditService = new CarbonCreditService();
