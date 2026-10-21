import { issueAuthorizationCode } from "@/services/public-api.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type") ?? "code";
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? undefined;
  const scope = url.searchParams.get("scope") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;

  if (responseType !== "code") {
    return Response.json(
      {
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      },
      { status: 400 },
    );
  }

  try {
    const record = issueAuthorizationCode({
      clientId,
      redirectUri,
      scope,
    });

    return Response.json({
      code: record.code,
      client_id: record.clientId,
      redirect_uri: record.redirectUri,
      scope: record.scopes.join(" "),
      environment: record.environment,
      expires_at: new Date(record.expiresAt).toISOString(),
      ...(state ? { state } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authorization failed";
    return Response.json(
      { error: "invalid_request", error_description: message },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      client_id?: string;
      clientId?: string;
      redirect_uri?: string;
      redirectUri?: string;
      scope?: string | string[];
      state?: string;
    };

    const clientId = body.client_id ?? body.clientId ?? "";
    const redirectUri = body.redirect_uri ?? body.redirectUri;
    const record = issueAuthorizationCode({
      clientId,
      redirectUri,
      scope: body.scope,
    });

    return Response.json(
      {
        code: record.code,
        client_id: record.clientId,
        redirect_uri: record.redirectUri,
        scope: record.scopes.join(" "),
        environment: record.environment,
        expires_at: new Date(record.expiresAt).toISOString(),
        ...(body.state ? { state: body.state } : {}),
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authorization failed";
    return Response.json(
      { error: "invalid_request", error_description: message },
      { status: 400 },
    );
  }
}
