import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { campaignWebhookService } from "@/services/campaign-webhook.service";
import { NextRequest } from "next/server";

describe("Campaign Webhooks API (Issue #873)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(campaignWebhookService, "treeVerified").mockResolvedValue(undefined);
    vi.spyOn(campaignWebhookService, "batchVerified").mockResolvedValue(undefined);
    vi.spyOn(campaignWebhookService, "campaignMilestoneReached").mockResolvedValue(undefined);
    vi.spyOn(campaignWebhookService, "campaignCompleted").mockResolvedValue(undefined);
  });

  const makeReq = (body: any) =>
    new NextRequest("http://localhost:3000/api/campaigns/c1/webhooks", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

  it("handles tree_verified webhook event", async () => {
    const req = makeReq({
      event: "tree_verified",
      verificationId: "v-1",
      treeId: "t-101",
      verifier: "G_VERIFIER",
    });

    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.event).toBe("tree_verified");
    expect(campaignWebhookService.treeVerified).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "c1",
        verificationId: "v-1",
        treeId: "t-101",
      })
    );
  });

  it("rejects batch_verified with fewer than 10 trees", async () => {
    const req = makeReq({
      event: "batch_verified",
      batchId: "b-1",
      treeIds: ["t-1", "t-2"], // Only 2 trees
    });

    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
  });

  it("handles batch_verified with 10+ trees", async () => {
    const treeIds = Array.from({ length: 12 }, (_, i) => `t-${i}`);
    const req = makeReq({
      event: "batch_verified",
      batchId: "b-100",
      treeIds,
    });

    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect(campaignWebhookService.batchVerified).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: "c1",
        batchId: "b-100",
        treeIds,
      })
    );
  });

  it("handles campaign_milestone_reached event", async () => {
    const req = makeReq({
      event: "campaign_milestone_reached",
      eventId: "m-50pct",
      percentage: 50,
      treeCount: 2500,
    });

    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect(campaignWebhookService.campaignMilestoneReached).toHaveBeenCalled();
  });

  it("handles campaign_completed event", async () => {
    const req = makeReq({
      event: "campaign_completed",
      completionId: "comp-1",
      treeCount: 5000,
    });

    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect(campaignWebhookService.campaignCompleted).toHaveBeenCalled();
  });
});
