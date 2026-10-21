import { issueOAuth2Token } from "@/services/public-api.service";

export const runtime = "nodejs";

function extractBasicAuthCredentials(
  request: Request,
): { clientId?: string; clientSecret?: string } {
  const auth = request.headers.get("authorization");
  if (!auth || !/^Basic\s+/i.test(auth)) return {};
  try {
    const encoded = auth.replace(/^Basic\s+/i, "").trim();
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) return {};
    return {
      clientId: decoded.slice(0, colonIdx),
      clientSecret: decoded.slice(colonIdx + 1),
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let body: Record<string, string | string[] | undefined> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formText = await request.text();
      const params = new URLSearchParams(formText);
      body = Object.fromEntries(params.entries());
    } else {
      body = (await request.json()) as Record<string, string | string[] | undefined>;
    }

    const basic = extractBasicAuthCredentials(request);
    const grantType = String(body.grant_type ?? body.grantType ?? "client_credentials");
    const clientId = String(body.client_id ?? body.clientId ?? basic.clientId ?? "");
    const clientSecret = String(
      body.client_secret ?? body.clientSecret ?? basic.clientSecret ?? "",
    );
    const code = body.code ? String(body.code) : undefined;
    const redirectUri = body.redirect_uri
      ? String(body.redirect_uri)
      : body.redirectUri
        ? String(body.redirectUri)
        : undefined;
    const refreshToken = body.refresh_token
      ? String(body.refresh_token)
      : body.refreshToken
        ? String(body.refreshToken)
        : undefined;
    const scope = body.scope;

    if (!clientId || !clientSecret) {
      return Response.json(
        {
          error: "invalid_client",
          error_description: "client_id and client_secret are required",
        },
        { status: 401 },
      );
    }

    const tokenResponse = issueOAuth2Token({
      grantType,
      clientId,
      clientSecret,
      code,
      redirectUri,
      refreshToken,
      scope,
    });

    return Response.json(tokenResponse, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OAuth2 token request failed";
    const [errCode, ...descParts] = message.includes(":")
      ? message.split(":")
      : ["invalid_request", message];
    const code = errCode.trim();
    const description = descParts.join(":").trim() || message;
    const status = code === "invalid_client" ? 401 : 400;

    return Response.json(
      {
        error: code,
        error_description: description,
      },
      { status },
    );
  }
}
