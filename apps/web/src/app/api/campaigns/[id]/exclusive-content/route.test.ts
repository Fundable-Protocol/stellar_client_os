import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "./route";
import { backersService } from "@/services/campaign-backers.service";
import { exclusiveContentService } from "@/services/campaign-exclusive-content.service";

const CAMPAIGN = "camp-api-exc";
const CREATOR = "GCREATOR...1111";
const BACKER = "GBACKER...2222";
const STRANGER = "GSTRANGER...3333";

beforeEach(() => {
  backersService.reset();
  exclusiveContentService.reset();
  backersService.registerCampaignCreator(CAMPAIGN, CREATOR);
  backersService.recordContribution({
    campaignId: CAMPAIGN,
    backerAddress: BACKER,
    amount: "300",
    token: "XLM",
  });
});

describe("/api/campaigns/[id]/exclusive-content route", () => {
  it("publishes exclusive content as the creator and gates GET responses by pledge status", async () => {
    const createReq = new NextRequest(
      `http://localhost/api/campaigns/${CAMPAIGN}/exclusive-content`,
      {
        method: "POST",
        body: JSON.stringify({
          creatorAddress: CREATOR,
          title: "Backer-Only Satellite Report",
          teaser: "Preview of the Q4 satellite report",
          richTextContent: "Full secret coordinates: -3.4653, -62.2159",
          attachments: [
            {
              fileName: "report.pdf",
              mimeType: "application/pdf",
              fileSizeBytes: 102400,
              downloadUrl: "https://example.com/report.pdf",
            },
          ],
        }),
      },
    );

    const createRes = await POST(createReq, { params: Promise.resolve({ id: CAMPAIGN }) });
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as { post: { id: string } };
    expect(createdBody.post.id).toBeTruthy();

    // Non-backer GET receives locked post with null body and null downloadUrl
    const strangerReq = new NextRequest(
      `http://localhost/api/campaigns/${CAMPAIGN}/exclusive-content?viewer=${STRANGER}`,
    );
    const strangerRes = await GET(strangerReq, { params: Promise.resolve({ id: CAMPAIGN }) });
    const strangerFeed = await strangerRes.json();
    expect(strangerFeed.gateStatus.hasAccess).toBe(false);
    expect(strangerFeed.posts[0].locked).toBe(true);
    expect(strangerFeed.posts[0].richTextContent).toBeNull();
    expect(strangerFeed.posts[0].attachments[0].downloadUrl).toBeNull();
    expect(strangerFeed.posts[0].teaser).toBe("Preview of the Q4 satellite report");

    // Verified backer GET receives unlocked post with full body and downloadUrl
    const backerReq = new NextRequest(
      `http://localhost/api/campaigns/${CAMPAIGN}/exclusive-content?viewer=${BACKER}`,
    );
    const backerRes = await GET(backerReq, { params: Promise.resolve({ id: CAMPAIGN }) });
    const backerFeed = await backerRes.json();
    expect(backerFeed.gateStatus.hasAccess).toBe(true);
    expect(backerFeed.posts[0].locked).toBe(false);
    expect(backerFeed.posts[0].richTextContent).toContain("-3.4653, -62.2159");
    expect(backerFeed.posts[0].attachments[0].downloadUrl).toBe("https://example.com/report.pdf");
  });

  it("returns 403 when a non-creator attempts to publish or delete", async () => {
    const forbiddenReq = new NextRequest(
      `http://localhost/api/campaigns/${CAMPAIGN}/exclusive-content`,
      {
        method: "POST",
        body: JSON.stringify({
          creatorAddress: BACKER,
          title: "Impersonated Post",
          richTextContent: "Not allowed",
        }),
      },
    );
    const forbiddenRes = await POST(forbiddenReq, { params: Promise.resolve({ id: CAMPAIGN }) });
    expect(forbiddenRes.status).toBe(403);

    const post = exclusiveContentService.publishPost({
      campaignId: CAMPAIGN,
      creatorAddress: CREATOR,
      title: "Creator Post",
      richTextContent: "Secret",
    });
    expect(post.ok).toBe(true);
    if (!post.ok) return;

    const delDeniedReq = new NextRequest(
      `http://localhost/api/campaigns/${CAMPAIGN}/exclusive-content?postId=${post.value.id}&creatorAddress=${BACKER}`,
      { method: "DELETE" },
    );
    const delDeniedRes = await DELETE(delDeniedReq, { params: Promise.resolve({ id: CAMPAIGN }) });
    expect(delDeniedRes.status).toBe(403);

    const delOkReq = new NextRequest(
      `http://localhost/api/campaigns/${CAMPAIGN}/exclusive-content?postId=${post.value.id}&creatorAddress=${CREATOR}`,
      { method: "DELETE" },
    );
    const delOkRes = await DELETE(delOkReq, { params: Promise.resolve({ id: CAMPAIGN }) });
    expect(delOkRes.status).toBe(200);
  });
});
