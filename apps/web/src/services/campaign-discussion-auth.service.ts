import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

declare const verifiedActorBrand: unique symbol;
declare const verifiedVoterBrand: unique symbol;

export type VerifiedCampaignDiscussionActor = {
  readonly address: string;
  readonly [verifiedActorBrand]: true;
};

export type VerifiedCampaignDiscussionVoter = {
  readonly id: string;
  readonly [verifiedVoterBrand]: true;
};

export class CampaignDiscussionAuthError extends Error {
  constructor(readonly code: "invalid_address") {
    super("A valid Stellar public key is required.");
    this.name = "CampaignDiscussionAuthError";
  }
}

interface Challenge {
  address: string;
  message: string;
  expiresAt: number;
}

interface IdentityToken {
  campaignId: string;
  address?: string;
  voterId?: string;
  expiresAt: number;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const IDENTITY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const challenges = new Map<string, Challenge>();
const tokens = new Map<string, IdentityToken>();

function decodeSignature(value: string): Buffer | null {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (/^[\da-f]{128}$/i.test(hex)) return Buffer.from(hex, "hex");
  const signature = Buffer.from(value, "base64");
  return signature.length === 64 && signature.toString("base64") === value ? signature : null;
}

function cleanExpiredEntries(now: number): void {
  for (const [nonce, challenge] of challenges) {
    if (challenge.expiresAt <= now) challenges.delete(nonce);
  }
  for (const [token, identity] of tokens) {
    if (identity.expiresAt <= now) tokens.delete(token);
  }
}

export function issueCampaignDiscussionVoterToken(campaignId: string, now = Date.now()): string {
  cleanExpiredEntries(now);
  const token = randomUUID();
  tokens.set(token, {
    campaignId,
    voterId: randomUUID(),
    expiresAt: now + IDENTITY_TTL_MS,
  });
  return token;
}

export function issueCampaignDiscussionChallenge(
  campaignId: string,
  address: string,
  now = Date.now(),
): { nonce: string; message: string } {
  cleanExpiredEntries(now);
  let publicKey: string;
  try {
    publicKey = Keypair.fromPublicKey(address).publicKey();
  } catch {
    throw new CampaignDiscussionAuthError("invalid_address");
  }

  const nonce = randomUUID();
  const message = [
    "Fundable campaign discussion identity verification",
    `Campaign: ${campaignId}`,
    `Address: ${publicKey}`,
    `Nonce: ${nonce}`,
  ].join("\n");
  challenges.set(`${campaignId}:${nonce}`, {
    address: publicKey,
    message,
    expiresAt: now + CHALLENGE_TTL_MS,
  });
  return { nonce, message };
}

export function verifyCampaignDiscussionChallenge(input: {
  campaignId: string;
  address: string;
  nonce: string;
  signature: string;
  now?: number;
}): string | null {
  const now = input.now ?? Date.now();
  cleanExpiredEntries(now);
  const challengeKey = `${input.campaignId}:${input.nonce}`;
  const challenge = challenges.get(challengeKey);
  challenges.delete(challengeKey);
  if (!challenge || challenge.expiresAt <= now) return null;

  try {
    const publicKey = Keypair.fromPublicKey(input.address);
    if (publicKey.publicKey() !== challenge.address) return null;
    const signature = decodeSignature(input.signature);
    if (!signature) return null;
    if (!publicKey.verify(Buffer.from(challenge.message, "utf8"), signature)) return null;

    const token = randomUUID();
    tokens.set(token, {
      campaignId: input.campaignId,
      address: challenge.address,
      expiresAt: now + IDENTITY_TTL_MS,
    });
    return token;
  } catch {
    return null;
  }
}

export function resolveCampaignDiscussionActor(
  campaignId: string,
  token: string,
  now = Date.now(),
): VerifiedCampaignDiscussionActor | null {
  cleanExpiredEntries(now);
  const identity = tokens.get(token);
  if (!identity?.address || identity.campaignId !== campaignId || identity.expiresAt <= now) return null;
  return { address: identity.address } as VerifiedCampaignDiscussionActor;
}

export function resolveCampaignDiscussionVoter(
  campaignId: string,
  token: string,
  now = Date.now(),
): VerifiedCampaignDiscussionVoter | null {
  cleanExpiredEntries(now);
  const identity = tokens.get(token);
  if (!identity?.voterId || identity.campaignId !== campaignId || identity.expiresAt <= now) return null;
  return { id: identity.voterId } as VerifiedCampaignDiscussionVoter;
}

export function resetCampaignDiscussionAuth(): void {
  challenges.clear();
  tokens.clear();
}
