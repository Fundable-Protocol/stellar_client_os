/**
 * GraphQL Resolvers — Aggregate Funding Analytics (issue #538)
 *
 * Thin resolver layer that delegates to the AnalyticsService.
 * Each resolver maps 1:1 to a Query field in the schema.
 */

import { DefaultStreamDataSource, getAnalyticsService } from "./analytics.service";
import { getCampaignHealthAssessment, getCampaignRiskAssessment, getCampaignVerificationSummary, queryCampaigns } from "@/services/campaign.service";
import type { CampaignDataSource, CampaignQueryInput } from "@/services/campaign.service";
import { getCampaignSequelService } from "@/services/campaign-sequel.service";
import { getCampaignAnalyticsDashboard } from "@/services/campaign-analytics-dashboard.service";
import { getGrantProgramService } from "@/services/grant-program.service";
import type {
  RegionFilter,
  CategoryFilter,
  AssetFilter,
  PaginationInput,
  StreamDataSource,
  StreamStatusFilter,
} from "./analytics.service";

type Network = "testnet" | "mainnet";

interface ResolverContext {
  /** Optional custom data source — used in tests to inject fixtures. */
  dataSource?: StreamDataSource;
  campaignDataSource?: CampaignDataSource;
}

function resolveDataSource(ctx: ResolverContext, fallback?: StreamDataSource): StreamDataSource {
  return ctx.dataSource ?? fallback ?? new DefaultStreamDataSource();
}

function toBigInt(value: string): bigint {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function paginate<T>(items: T[], pagination?: PaginationInput): T[] {
  const limit = Math.min(Math.max(pagination?.limit ?? 20, 1), 100);
  const offset = Math.max(pagination?.offset ?? 0, 0);
  return items.slice(offset, offset + limit);
}

function toCampaignPayload(campaign: import("@/services/campaign.service").CampaignRecord) {
  const verification = getCampaignVerificationSummary(campaign);
  const riskAssessment = getCampaignRiskAssessment(campaign);
  const healthAssessment = getCampaignHealthAssessment(campaign);

  return {
    ...campaign,
    verification,
    verificationStatus: verification.status,
    verified: verification.isVerified,
    verificationBadges: verification.badges,
    riskAssessment,
    riskScore: riskAssessment.score,
    riskLevel: riskAssessment.level,
    riskFlags: riskAssessment.redFlags,
    healthAssessment,
    healthScore: healthAssessment.score,
    healthLevel: healthAssessment.level,
    createdAt: Math.floor(campaign.createdAt / 1000),
    updatedAt: Math.floor(campaign.updatedAt / 1000),
    statusChangedAt: Math.floor(campaign.statusChangedAt / 1000),
    sponsors: campaign.sponsors.map((sponsor) => ({ ...sponsor, sponsoredAt: Math.floor(sponsor.sponsoredAt / 1000) })),
    statusHistory: campaign.statusHistory.map((entry) => ({ ...entry, changedAt: Math.floor(entry.changedAt / 1000) })),
  };
}

function toProgramPayload(program: import("@/services/grant-program.service").GrantProgram) {
  return {
    ...program,
    createdAt: Math.floor(program.createdAt / 1000),
    updatedAt: Math.floor(program.updatedAt / 1000),
  };
}

export function createResolvers(defaultDataSource?: StreamDataSource) {
  return {
    Query: {
      campaigns: async (
        _: unknown,
        args: {
          filter?: CampaignQueryInput["filter"];
          sort?: CampaignQueryInput["sort"];
          pagination?: PaginationInput;
          network?: Network;
        },
        ctx: ResolverContext,
      ) => {
        const campaigns = await queryCampaigns({
          filter: args.filter,
          sort: args.sort,
          limit: args.pagination?.limit,
          offset: args.pagination?.offset,
          network: args.network,
        }, ctx.campaignDataSource);
        return campaigns.map(toCampaignPayload);
      },

      trees: async (
        _: unknown,
        args: {
          filter?: { planter?: string; region?: string; status?: StreamStatusFilter; search?: string };
          pagination?: PaginationInput;
          network?: Network;
        },
        ctx: ResolverContext,
      ) => {
        const streams = await resolveDataSource(ctx, defaultDataSource).getStreams(args.network ?? "testnet");
        const filter = args.filter ?? {};
        const filtered = streams.filter((stream) => {
          if (filter.planter && stream.recipient !== filter.planter) return false;
          if (filter.region && stream.region !== filter.region) return false;
          if (filter.status && stream.status !== filter.status) return false;
          if (filter.search) {
            const haystack = `${stream.id} ${stream.recipient} ${stream.region ?? ""} ${stream.category ?? ""}`.toLowerCase();
            if (!haystack.includes(filter.search.toLowerCase())) return false;
          }
          return true;
        });
        return paginate(filtered.map((stream) => ({
          id: stream.id,
          planter: stream.recipient,
          region: stream.region ?? null,
          category: stream.category ?? null,
          status: stream.status,
          asset: stream.asset,
          sponsoredAmount: stream.totalAmount,
          createdAt: stream.createdAt,
        })), args.pagination);
      },

      planters: async (
        _: unknown,
        args: { region?: string; pagination?: PaginationInput; network?: Network },
        ctx: ResolverContext,
      ) => {
        const streams = await resolveDataSource(ctx, defaultDataSource).getStreams(args.network ?? "testnet");
        const groups = new Map<string, { region: string | null; treeCount: number; sponsoredAmount: bigint }>();
        for (const stream of streams) {
          if (args.region && stream.region !== args.region) continue;
          const current = groups.get(stream.recipient) ?? { region: stream.region ?? null, treeCount: 0, sponsoredAmount: 0n };
          current.treeCount += 1;
          current.sponsoredAmount += toBigInt(stream.totalAmount);
          groups.set(stream.recipient, current);
        }
        return paginate(Array.from(groups, ([address, value]) => ({
          address,
          region: value.region,
          treeCount: value.treeCount,
          sponsoredAmount: value.sponsoredAmount.toString(),
        })), args.pagination);
      },

      contracts: async (
        _: unknown,
        args: { pagination?: PaginationInput; network?: Network },
        ctx: ResolverContext,
      ) => {
        const streams = await resolveDataSource(ctx, defaultDataSource).getStreams(args.network ?? "testnet");
        const groups = new Map<string, { symbol: string; streamCount: number; totalVolume: bigint }>();
        for (const stream of streams) {
          const current = groups.get(stream.asset) ?? { symbol: stream.symbol ?? stream.asset.slice(0, 8), streamCount: 0, totalVolume: 0n };
          current.streamCount += 1;
          current.totalVolume += toBigInt(stream.totalAmount);
          groups.set(stream.asset, current);
        }
        return paginate(Array.from(groups, ([address, value]) => ({
          address,
          symbol: value.symbol,
          streamCount: value.streamCount,
          totalVolume: value.totalVolume.toString(),
        })), args.pagination);
      },

      /**
       * Global aggregate metrics across all streams.
       *
       * @example
       * query { globalMetrics(network: testnet) { totalStreams activeStreams totalVolumeUsd } }
       */
      globalMetrics: async (
        _: unknown,
        args: { network?: Network },
        ctx: ResolverContext
      ) => {
        const service = getAnalyticsService(ctx.dataSource ?? defaultDataSource);
        return service.getGlobalMetrics(args.network ?? "testnet");
      },

      /**
       * Aggregate metrics broken down by geographic region.
       *
       * @example
       * query {
       *   regionMetrics(filter: { region: "NG" }, pagination: { limit: 5 }) {
       *     region totalStreams totalVolumeUsd projectCount
       *     assetBreakdown { asset symbol totalVolume streamCount }
       *   }
       * }
       */
      regionMetrics: async (
        _: unknown,
        args: {
          filter?: RegionFilter;
          pagination?: PaginationInput;
          network?: Network;
        },
        ctx: ResolverContext
      ) => {
        const service = getAnalyticsService(ctx.dataSource ?? defaultDataSource);
        return service.getRegionMetrics(
          args.filter,
          args.pagination,
          args.network ?? "testnet"
        );
      },

      /**
       * Aggregate metrics broken down by funding category.
       *
       * @example
       * query {
       *   categoryMetrics(filter: { category: "climate" }) {
       *     category totalStreams totalVolumeUsd sharePercent
       *   }
       * }
       */
      categoryMetrics: async (
        _: unknown,
        args: {
          filter?: CategoryFilter;
          pagination?: PaginationInput;
          network?: Network;
        },
        ctx: ResolverContext
      ) => {
        const service = getAnalyticsService(ctx.dataSource ?? defaultDataSource);
        return service.getCategoryMetrics(
          args.filter,
          args.pagination,
          args.network ?? "testnet"
        );
      },

      /**
       * Aggregate metrics broken down by asset (token contract address).
       *
       * @example
       * query {
       *   assetMetrics(filter: { status: Active }) {
       *     asset symbol totalVolume streamCount uniqueSenders uniqueRecipients
       *   }
       * }
       */
      assetMetrics: async (
        _: unknown,
        args: {
          filter?: AssetFilter;
          pagination?: PaginationInput;
          network?: Network;
        },
        ctx: ResolverContext
      ) => {
        const service = getAnalyticsService(ctx.dataSource ?? defaultDataSource);
        return service.getAssetMetrics(
          args.filter,
          args.pagination,
          args.network ?? "testnet"
        );
      },

      /**
       * A sponsor's impact (estimated CO2 offset) vs the global average
       * sponsor, including a percentile ranking (top 10%, etc.).
       *
       * @example
       * query {
       *   sponsorImpact(address: "GAAA") {
       *     myVolumeUsd myCo2OffsetKg globalAverageCo2OffsetKg
       *     globalSponsorCount percentile rankingBand
       *   }
       * }
       */
      sponsorImpact: async (
        _: unknown,
        args: { address: string; network?: Network },
        ctx: ResolverContext
      ) => {
        const service = getAnalyticsService(ctx.dataSource ?? defaultDataSource);
        return service.getSponsorImpact(args.address, args.network ?? "testnet");
      },

      campaignSequels: async (
        _: unknown,
        args: { campaignId: string; relation?: "SEQUEL" | "PREQUEL" | "SPINOFF" | "RELATED" },
        ctx: ResolverContext,
      ) => {
        const sequels = await getCampaignSequelService(ctx.campaignDataSource).getSequels(args.campaignId, {
          relation: args.relation,
        });
        return sequels.map(({ link, campaign }) => ({
          link: {
            ...link,
            linkedAt: Math.floor(link.linkedAt / 1000),
          },
          campaign: toCampaignPayload(campaign),
        }));
      },

      nextInSeries: async (
        _: unknown,
        args: { campaignId: string },
        ctx: ResolverContext,
      ) => {
        const result = await getCampaignSequelService(ctx.campaignDataSource).getNextInSeries(args.campaignId);
        if (!result) return null;
        return {
          link: { ...result.link, linkedAt: Math.floor(result.link.linkedAt / 1000) },
          series: result.series
            ? { ...result.series, createdAt: Math.floor(result.series.createdAt / 1000), updatedAt: Math.floor(result.series.updatedAt / 1000) }
            : null,
          campaign: toCampaignPayload(result.campaign),
        };
      },

      campaignAnalytics: async (
        _: unknown,
        args: { campaignId: string; network?: Network },
      ) => {
        return getCampaignAnalyticsDashboard(args.campaignId);
      },

      grantPrograms: async () => {
        const programs = await getGrantProgramService().listPrograms();
        return programs.map(toProgramPayload);
      },

      grantProgramSummary: async (
        _: unknown,
        args: { programId: string; campaignId: string },
      ) => {
        const summary = await getGrantProgramService().getProgramSummary(args.programId, args.campaignId);
        if (!summary) return null;
        return {
          ...summary,
          program: toProgramPayload(summary.program),
        };
      },

      campaignGrantAllocations: async (
        _: unknown,
        args: { campaignId: string },
      ) => {
        const allocations = await getGrantProgramService().getCampaignAllocations(args.campaignId);
        return allocations.map((allocation) => ({
          ...allocation,
          allocatedAt: Math.floor(allocation.allocatedAt / 1000),
        }));
      },
    },
    Mutation: {
      cloneCampaign: async (
        _: unknown,
        args: { id: string; network?: Network },
        ctx: ResolverContext
      ) => {
        const streams = await resolveDataSource(ctx, defaultDataSource).getStreams(args.network ?? "testnet");
        const campaign = streams.find((stream) => stream.id === args.id);
        if (!campaign) throw new Error(`Campaign ${args.id} not found`);
        return {
          ...campaign,
          id: `cloned-${campaign.id}`,
        };
      },
    },
  };
}
