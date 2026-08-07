/**
 * POST /api/graphql — GraphQL Gateway (issue #538)
 *
 * Exposes aggregate payment stream metrics via a standard GraphQL endpoint
 * using graphql-yoga, which integrates natively with Next.js App Router
 * route handlers (no extra server or middleware required).
 *
 * # Supported queries
 *   - globalMetrics    — top-level aggregate across all streams
 *   - regionMetrics    — breakdown by geographic region
 *   - categoryMetrics  — breakdown by funding category
 *   - assetMetrics     — breakdown by token contract address
 *
 * # Introspection / Playground
 * In development (`NODE_ENV !== production`), navigate to /api/graphql in
 * your browser to open the built-in GraphiQL playground.
 *
 * # Security
 * - Introspection is disabled in production.
 * - Request body is limited to 100 KB (configurable via GRAPHQL_BODY_LIMIT_BYTES).
 * - CORS is handled by Next.js middleware / headers config.
 *
 * @example
 * ```bash
 * curl -X POST /api/graphql \
 *   -H "Content-Type: application/json" \
 *   -d '{"query":"{ globalMetrics { totalStreams activeStreams totalVolumeUsd } }"}'
 * ```
 */

import { createYoga } from "graphql-yoga";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefs } from "@/graphql/schema";
import { createResolvers } from "@/graphql/resolvers";

const BODY_LIMIT = Number(
  process.env.GRAPHQL_BODY_LIMIT_BYTES ?? 100 * 1024 // 100 KB
);

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: createResolvers(),
});

const yoga = createYoga({
  schema,
  // Route handler path must match the Next.js route
  graphqlEndpoint: "/api/graphql",
  // Disable introspection and playground in production
  graphiql: process.env.NODE_ENV !== "production",
  fetchAPI: { Response },
  // Context factory: exposes optional custom data source per-request
  context: async () => ({}),
  // Body size limit
  parserAndValidationCache: true,
});

export async function GET(request: Request) {
  return yoga.fetch(request);
}

export async function POST(request: Request) {
  // Enforce body size limit before passing to yoga
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > BODY_LIMIT) {
    return new Response(
      JSON.stringify({ errors: [{ message: "Request body too large" }] }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }
  return yoga.fetch(request);
}
