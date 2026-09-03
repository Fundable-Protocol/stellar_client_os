import { describe, expect, it, beforeEach } from "vitest";
import {
  CampaignSequelService,
  getCampaignSequelService,
  resetCampaignSequelService,
  seedCampaignSeries,
  type CampaignSeries,
  type CampaignSequelLink,
} from "./campaign-sequel.service";
import {
  InMemoryCampaignDataSource,
  createCampaign,
  type CampaignDataSource,
} from "./campaign.service";

function buildSource(): CampaignDataSource {
  const source = new InMemoryCampaignDataSource();
  return source;
}

async function seedCampaigns(source: CampaignDataSource, ids: string[]): Promise<void> {
  for (const id of ids) {
    await createCampaign({ id, creator: "creator-1", name: `Campaign ${id}`, goalAmount: "1000" }, source);
  }
}

describe("campaign sequel service", () => {
  let source: CampaignDataSource;
  let service: CampaignSequelService;

  beforeEach(() => {
    resetCampaignSequelService();
    source = buildSource();
    service = new CampaignSequelService({ dataSource: source, isolated: true });
  });

  it("links two campaigns and lists them as sequels", async () => {
    await seedCampaigns(source, ["a", "b"]);
    const link = await service.linkCampaigns({
      sourceCampaignId: "a",
      targetCampaignId: "b",
      relation: "SEQUEL",
      order: 2,
      linkedBy: "creator-1",
    });

    const sequels = await service.getSequels("a");
    expect(sequels).toHaveLength(1);
    expect(sequels[0].campaign.id).toBe("b");
    expect(sequels[0].link.relation).toBe("SEQUEL");
    expect(sequels[0].link.order).toBe(2);
    expect(link.id).toBeTruthy();
  });

  it("rejects linking a campaign to itself", async () => {
    await seedCampaigns(source, ["a"]);
    await expect(
      service.linkCampaigns({
        sourceCampaignId: "a",
        targetCampaignId: "a",
        relation: "RELATED",
        linkedBy: "creator-1",
      }),
    ).rejects.toThrow("cannot be linked to itself");
  });

  it("rejects unknown relations and missing campaigns", async () => {
    await seedCampaigns(source, ["a", "b"]);
    await expect(
      service.linkCampaigns({
        sourceCampaignId: "a",
        targetCampaignId: "b",
        relation: "PLOT_TWIST" as never,
        linkedBy: "creator-1",
      }),
    ).rejects.toThrow("relation must be one of");
    await expect(
      service.linkCampaigns({
        sourceCampaignId: "a",
        targetCampaignId: "missing",
        relation: "RELATED",
        linkedBy: "creator-1",
      }),
    ).rejects.toThrow("Campaign missing not found");
  });

  it("unlinks campaigns", async () => {
    await seedCampaigns(source, ["a", "b"]);
    await service.linkCampaigns({
      sourceCampaignId: "a",
      targetCampaignId: "b",
      relation: "SEQUEL",
      linkedBy: "creator-1",
    });
    expect(await service.getSequels("a")).toHaveLength(1);
    expect(await service.unlinkCampaigns("a", "b")).toBe(true);
    expect(await service.getSequels("a")).toHaveLength(0);
    expect(await service.unlinkCampaigns("a", "b")).toBe(false);
  });

  it("replacing a link keeps a single relation between two campaigns", async () => {
    await seedCampaigns(source, ["a", "b"]);
    await service.linkCampaigns({
      sourceCampaignId: "a",
      targetCampaignId: "b",
      relation: "RELATED",
      linkedBy: "creator-1",
    });
    await service.linkCampaigns({
      sourceCampaignId: "a",
      targetCampaignId: "b",
      relation: "SEQUEL",
      order: 1,
      linkedBy: "creator-1",
    });
    const sequels = await service.getSequels("a");
    expect(sequels).toHaveLength(1);
    expect(sequels[0].link.relation).toBe("SEQUEL");
  });

  it("returns the next campaign in a series", async () => {
    await seedCampaigns(source, ["a", "b", "c"]);
    const series = await service.createSeries({
      name: "Amazon Trilogy",
      creator: "creator-1",
      campaignIds: ["a", "b", "c"],
    });
    await service.linkCampaigns({
      sourceCampaignId: "a",
      targetCampaignId: "b",
      relation: "SEQUEL",
      order: 1,
      seriesId: series.id,
      linkedBy: "creator-1",
    });
    await service.linkCampaigns({
      sourceCampaignId: "b",
      targetCampaignId: "c",
      relation: "SEQUEL",
      order: 2,
      seriesId: series.id,
      linkedBy: "creator-1",
    });

    const next = await service.getNextInSeries("a");
    expect(next?.campaign.id).toBe("b");
    expect(next?.series?.name).toBe("Amazon Trilogy");

    await service.linkCampaigns({
      sourceCampaignId: "c",
      targetCampaignId: "a",
      relation: "SEQUEL",
      order: 3,
      seriesId: series.id,
      linkedBy: "creator-1",
    });
    const closedLoop = await service.getNextInSeries("c");
    expect(closedLoop?.campaign.id).toBe("a");
  });

  it("returns null when the series has no next entry", async () => {
    await seedCampaigns(source, ["a"]);
    expect(await service.getNextInSeries("a")).toBeNull();
  });

  it("creates, renames, and deletes franchises", async () => {
    await seedCampaigns(source, ["a", "b"]);
    const series = await service.createSeries({
      name: "Ocean Universe",
      description: "Shared world",
      creator: "creator-1",
      campaignIds: ["a", "b"],
    });
    expect((await service.listSeries()).map((item) => item.id)).toEqual([series.id]);

    const renamed = await service.renameSeries(series.id, "Ocean Multiverse");
    expect(renamed?.name).toBe("Ocean Multiverse");

    expect(await service.getFranchise("a")).toBeNull();
    await service.linkCampaigns({
      sourceCampaignId: "a",
      targetCampaignId: "b",
      relation: "RELATED",
      seriesId: series.id,
      linkedBy: "creator-1",
    });
    expect((await service.getFranchise("a"))?.id).toBe(series.id);

    expect(await service.deleteSeries(series.id)).toBe(true);
    expect(await service.getSeries("a")).toBeNull();
  });

  it("rejects linking to an unknown series and duplicates in a series", async () => {
    await seedCampaigns(source, ["a", "b"]);
    await expect(
      service.linkCampaigns({
        sourceCampaignId: "a",
        targetCampaignId: "b",
        relation: "SEQUEL",
        seriesId: "series_missing",
        linkedBy: "creator-1",
      }),
    ).rejects.toThrow("not found");
    await expect(
      service.createSeries({
        name: "Dupes",
        creator: "creator-1",
        campaignIds: ["a", "a"],
      }),
    ).rejects.toThrow("duplicate campaigns");
  });

  it("returns incoming relations for the target campaign", async () => {
    await seedCampaigns(source, ["a", "b"]);
    await service.linkCampaigns({
      sourceCampaignId: "a",
      targetCampaignId: "b",
      relation: "SEQUEL",
      linkedBy: "creator-1",
    });
    const incoming = await service.getSequels("b");
    expect(incoming).toHaveLength(1);
    expect(incoming[0].campaign.id).toBe("a");
    const outgoingOnly = await service.getSequels("b", { includeIncoming: false });
    expect(outgoingOnly).toHaveLength(0);
  });
});

describe("campaign sequel service seed/reset", () => {
  it("seedCampaignSeries replaces the default graph", async () => {
    resetCampaignSequelService();
    const source = new InMemoryCampaignDataSource();
    await seedCampaigns(source, ["s1", "s2"]);
    const series: CampaignSeries = {
      id: "series_1",
      name: "Seeded",
      creator: "creator-1",
      campaignIds: ["s1", "s2"],
      createdAt: 1,
      updatedAt: 2,
    };
    const links: CampaignSequelLink[] = [
      {
        id: "seq_1",
        sourceCampaignId: "s1",
        targetCampaignId: "s2",
        relation: "SEQUEL",
        order: 1,
        seriesId: "series_1",
        linkedBy: "creator-1",
        linkedAt: 3,
      },
    ];
    seedCampaignSeries([series], links);

    const service = getCampaignSequelService(source);
    expect(service).toBeInstanceOf(CampaignSequelService);
    const next = await service.getNextInSeries("s1");
    expect(next?.campaign.id).toBe("s2");
  });
});