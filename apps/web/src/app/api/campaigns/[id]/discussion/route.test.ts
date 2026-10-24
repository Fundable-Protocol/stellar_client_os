// @vitest-environment node

import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { Keypair } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCampaign } from "@/services/campaign.service";
import {
  issueCampaignDiscussionChallenge,
  resetCampaignDiscussionAuth,
  verifyCampaignDiscussionChallenge,
} from "@/services/campaign-discussion-auth.service";
import { resetCampaignDiscussion } from "@/services/campaign-discussion.service";
import { PATCH, POST } from "./route";

vi.mock("@/services/campaign.service", () => ({
  getCampaign: vi.fn(),
}));

const campaignId = "discussion-route-test";
const params = Promise.resolve({ id: campaignId });
let creator: Keypair;

beforeEach(() => {
  resetCampaignDiscussion();
  resetCampaignDiscussionAuth();
  creator = Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)));
  vi.mocked(getCampaign).mockResolvedValue({ creator: creator.publicKey() } as NonNullable<
    Awaited<ReturnType<typeof getCampaign>>
  >);
});

function jsonRequest(body: unknown): Request {
  return new Request(`http://localhost/api/campaigns/${campaignId}/discussion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function signedToken(keypair: Keypair): string {
  const challenge = issueCampaignDiscussionChallenge(campaignId, keypair.publicKey());
  const token = verifyCampaignDiscussionChallenge({
    campaignId,
    address: keypair.publicKey(),
    nonce: challenge.nonce,
    signature: keypair.sign(Buffer.from(challenge.message, "utf8")).toString("base64"),
  });
  if (!token) throw new Error("Test keypair challenge should verify.");
  return token;
}

describe("campaign discussion API", () => {
  it("rejects malformed JSON and invalid field types with fixed errors", async () => {
    const malformed = await POST(new Request(`http://localhost/api/campaigns/${campaignId}/discussion`, {
      method: "POST",
      body: "{",
    }), { params });
    const invalid = await POST(jsonRequest({
      authorName: "Visitor",
      content: 99,
    }), { params });

    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Malformed JSON request body." });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "Invalid request body." });
  });

  it("requires a verified creator identity to mark a reply as official", async () => {
    const questionResponse = await POST(jsonRequest({
      authorName: "Visitor",
      content: "A question",
    }), { params });
    const { comment: question } = await questionResponse.json() as { comment: { id: string } };
    const unauthorized = await POST(jsonRequest({
      authorName: "Creator",
      content: "An answer",
      parentId: question.id,
      officialAnswer: true,
    }), { params });
    const nonCreatorToken = signedToken(Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32))));
    const forbidden = await POST(jsonRequest({
      authorName: "Visitor",
      content: "An answer",
      parentId: question.id,
      officialAnswer: true,
      actorToken: nonCreatorToken,
    }), { params });

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it("rejects pinning unless the verified actor is the campaign creator", async () => {
    const created = await POST(jsonRequest({
      authorName: "Visitor",
      content: "A comment",
    }), { params });
    const { comment } = await created.json() as { comment: { id: string } };
    const response = await PATCH(new Request(`http://localhost/api/campaigns/${campaignId}/discussion`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "pin",
        commentId: comment.id,
        actorToken: signedToken(Keypair.fromRawEd25519Seed(Buffer.from(randomBytes(32)))),
      }),
    }), { params });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Only the campaign creator can perform this action.",
    });
  });

  it("returns a generic server error and logs unexpected service failures", async () => {
    const error = new Error("database details");
    vi.mocked(getCampaign).mockRejectedValueOnce(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST(jsonRequest({ authorName: "Visitor", content: "Comment" }), { params });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "An unexpected error occurred." });
      expect(log).toHaveBeenCalledWith("Campaign discussion create failed unexpectedly.", error);
    } finally {
      log.mockRestore();
    }
  });
});
