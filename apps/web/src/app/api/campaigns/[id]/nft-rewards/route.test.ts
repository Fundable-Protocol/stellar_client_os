import { describe, it, expect, beforeEach } from "vitest";
import { GET as getTiers, POST as postTier } from "./route";
import { GET as getAirdrops, POST as postAirdrop } from "./airdrop/route";
import { campaignNFTRewardService } from "@/services/campaign-nft-reward.service";
import { NextRequest } from "next/server";

describe("NFT Rewards API Routes", () => {
  const campaignId = "camp-api-nft-test";
  const creatorAddress = "GCREATOR_API_TEST";
  const backerAddress = "GBACKER_API_TEST";

  beforeEach(() => {
    campaignNFTRewardService.clearAll();
  });

  it("POST & GET /api/campaigns/[id]/nft-rewards", async () => {
    const postReq = new NextRequest(`http://localhost:3000/api/campaigns/${campaignId}/nft-rewards`, {
      method: "POST",
      body: JSON.stringify({
        creatorAddress,
        tier: {
          name: "Stellar Apex Tree NFT",
          description: "Exclusive digital badge reward",
          minimumPledge: "100.00",
          asset: {
            assetUrl: "https://ipfs.io/ipfs/QmApexTree/asset.png",
            fileName: "apex.png",
          },
        },
      }),
    });

    const postRes = await postTier(postReq, { params: Promise.resolve({ id: campaignId }) });
    expect(postRes.status).toBe(201);
    const postJson = await postRes.json();
    expect(postJson.success).toBe(true);
    expect(postJson.nftRewardTier.name).toBe("Stellar Apex Tree NFT");

    const getReq = new NextRequest(`http://localhost:3000/api/campaigns/${campaignId}/nft-rewards`);
    const getRes = await getTiers(getReq, { params: Promise.resolve({ id: campaignId }) });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.success).toBe(true);
    expect(getJson.nftRewardTiers.length).toBe(1);
  });

  it("GET /api/campaigns/[id]/nft-rewards/airdrop with backerAddress filter", async () => {
    // Define tier and airdrop
    await campaignNFTRewardService.defineNFTRewardTier(campaignId, creatorAddress, {
      name: "Stellar Apex Tree NFT",
      minimumPledge: "100.00",
      asset: { assetUrl: "https://ipfs.io/ipfs/QmApexTree/asset.png" },
    });

    const getReq = new NextRequest(
      `http://localhost:3000/api/campaigns/${campaignId}/nft-rewards/airdrop?backerAddress=${backerAddress}`
    );
    const getRes = await getAirdrops(getReq, { params: Promise.resolve({ id: campaignId }) });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.success).toBe(true);
    expect(Array.isArray(getJson.airdrops)).toBe(true);
  });
});
