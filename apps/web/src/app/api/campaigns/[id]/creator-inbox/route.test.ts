import { describe, expect, it, beforeEach } from "vitest";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
} from "../../../../../services/campaign.service";
import { clearCreatorInbox } from "../../../../../services/creator-inbox.service";
import { GET, POST } from "./route";

describe("POST & GET /api/campaigns/[id]/creator-inbox", () => {
  let dataSource: InMemoryCampaignDataSource;

  beforeEach(async () => {
    dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
    clearCreatorInbox();

    await createCampaign(
      {
        id: "camp-inbox-test",
        creator: "GCREATOR_WALLET_99",
        creatorEmail: "creator99@example.com",
        name: "Eco Reforestation Test",
        goalAmount: "10000",
      },
      dataSource,
    );
  });

  it("returns 404 if campaign is not found", async () => {
    const postRes = await POST(
      new Request("http://localhost/api/campaigns/nonexistent/creator-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Is this valid?" }),
      }),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(postRes.status).toBe(404);

    const getRes = await GET(
      new Request("http://localhost/api/campaigns/nonexistent/creator-inbox"),
      { params: Promise.resolve({ id: "nonexistent" }) },
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 400 if question is missing or empty", async () => {
    const response = await POST(
      new Request("http://localhost/api/campaigns/camp-inbox-test/creator-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "   " }),
      }),
      { params: Promise.resolve({ id: "camp-inbox-test" }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Question is required");
  });

  it("successfully escalates question to creator and retrieves messages", async () => {
    const postRes = await POST(
      new Request("http://localhost/api/campaigns/camp-inbox-test/creator-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Can I receive physical certificates for tree adoption?",
          backerContact: "sponsor@company.com",
        }),
      }),
      { params: Promise.resolve({ id: "camp-inbox-test" }) },
    );

    expect(postRes.status).toBe(201);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.message.question).toBe("Can I receive physical certificates for tree adoption?");
    expect(postData.message.creatorAddress).toBe("GCREATOR_WALLET_99");

    const getRes = await GET(
      new Request("http://localhost/api/campaigns/camp-inbox-test/creator-inbox"),
      { params: Promise.resolve({ id: "camp-inbox-test" }) },
    );

    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.total).toBe(1);
    expect(getData.messages[0].question).toBe("Can I receive physical certificates for tree adoption?");
  });
});
