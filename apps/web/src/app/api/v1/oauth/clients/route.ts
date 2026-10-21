import {
  listOAuth2Clients,
  registerOAuth2Client,
} from "@/services/public-api.service";
import type { PublicApiEnvironment, PublicApiTier } from "@/types/public-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const envParam = url.searchParams.get("environment");
  const environment: PublicApiEnvironment | undefined =
    envParam === "sandbox" || envParam === "production" ? envParam : undefined;

  return Response.json({
    data: listOAuth2Clients(environment),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      redirectUris?: string[];
      scopes?: string[] | string;
      environment?: PublicApiEnvironment;
      tier?: PublicApiTier;
    };

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return Response.json(
        { error: "invalid_request", error_description: "name is required" },
        { status: 400 },
      );
    }

    const client = registerOAuth2Client({
      name: body.name,
      description: body.description,
      redirectUris: body.redirectUris,
      scopes: body.scopes,
      environment: body.environment,
      tier: body.tier,
    });

    return Response.json(client, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to register OAuth2 client";
    return Response.json(
      { error: "invalid_request", error_description: message },
      { status: 400 },
    );
  }
}
