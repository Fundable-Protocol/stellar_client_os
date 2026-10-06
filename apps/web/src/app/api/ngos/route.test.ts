import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import {
  InMemoryPartnershipDataSource,
  setPartnershipDataSource,
} from "@/services/campaign-partnership.service";

describe("/api/ngos", () => {
  beforeEach(() => {
    setPartnershipDataSource(new InMemoryPartnershipDataSource());
  });

  it("lists verified NGOs by default", async () => {
    const response = await GET(new Request("http://test/api/ngos"));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toHaveLength(2);
    expect(data.every((ngo: { isVerified: boolean }) => ngo.isVerified)).toBe(true);
  });

  it("filters by service, country, status and query", async () => {
    const service = await GET(new Request("http://test/api/ngos?service=LAND_ACCESS"));
    const { data: serviceData } = await service.json();
    expect(serviceData.map((n: { id: string }) => n.id)).toEqual(["ngo-2"]);

    const country = await GET(new Request("http://test/api/ngos?country=kenya"));
    const { data: countryData } = await country.json();
    expect(countryData.map((n: { id: string }) => n.id)).toEqual(["ngo-1"]);

    const pending = await GET(new Request("http://test/api/ngos?status=PENDING"));
    const { data: pendingData } = await pending.json();
    expect(pendingData.map((n: { id: string }) => n.id)).toEqual(["ngo-3"]);

    const all = await GET(new Request("http://test/api/ngos?status=ALL"));
    const { data: allData } = await all.json();
    expect(allData).toHaveLength(3);
  });

  it("rejects invalid filter values", async () => {
    const badService = await GET(new Request("http://test/api/ngos?service=HACKING"));
    expect(badService.status).toBe(400);

    const badStatus = await GET(new Request("http://test/api/ngos?status=WHATEVER"));
    expect(badStatus.status).toBe(400);
  });

  it("registers a new NGO in pending status", async () => {
    const response = await POST(
      new Request("http://test/api/ngos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "New Forests",
          description: "Reforestation across East Africa",
          services: ["LAND_ACCESS", "PLANTING_LABOR"],
          country: "Rwanda",
        }),
      }),
    );

    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({
      name: "New Forests",
      verificationStatus: "PENDING",
      isVerified: false,
      country: "Rwanda",
    });

    const listed = await GET(new Request("http://test/api/ngos?status=PENDING"));
    const { data: pending } = await listed.json();
    expect(pending.map((n: { id: string }) => n.id)).toContain(data.id);
  });

  it("rejects an invalid registration payload", async () => {
    const response = await POST(
      new Request("http://test/api/ngos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Bad", description: "", services: ["NOPE"] }),
      }),
    );
    expect(response.status).toBe(400);
  });
});