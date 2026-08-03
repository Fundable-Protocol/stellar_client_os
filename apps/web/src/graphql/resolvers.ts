/**
 * GraphQL Resolvers — Aggregate Funding Analytics (issue #538)
 *
 * Thin resolver layer that delegates to the AnalyticsService.
 * Each resolver maps 1:1 to a Query field in the schema.
 */

import { getAnalyticsService } from "./analytics.service";
import type {
  RegionFilter,
  CategoryFilter,
  AssetFilter,
  PaginationInput,
  StreamDataSource,
} from "./analytics.service";

type Network = "testnet" | "mainnet";

interface ResolverContext {
  /** Optional custom data source — used in tests to inject fixtures. */
  dataSource?: StreamDataSource;
}

export function createResolvers(defaultDataSource?: StreamDataSource) {
  return {
    Query: {
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
    },
  };
}
