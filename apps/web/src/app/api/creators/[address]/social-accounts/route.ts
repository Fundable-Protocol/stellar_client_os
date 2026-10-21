export const runtime = "nodejs";

import {
  connectSocialAccount,
  disconnectSocialAccount,
  getCreatorSocialSettings,
  updateCreatorSocialSettings,
  type SchedulablePlatform,
} from "@/services/campaign-social-scheduler.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const settings = getCreatorSocialSettings(address);
  return Response.json(
    { settings },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  try {
    const body = (await request.json()) as {
      platform?: SchedulablePlatform;
      handle?: string;
      displayName?: string;
      autoHashtags?: boolean;
    };
    if (!body.platform || !body.handle) {
      return Response.json(
        { error: "platform and handle are required" },
        { status: 400 },
      );
    }
    const settings = connectSocialAccount(address, {
      platform: body.platform,
      handle: body.handle,
      displayName: body.displayName,
      autoHashtags: body.autoHashtags,
    });
    return Response.json({ settings }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  try {
    const body = (await request.json()) as {
      defaultHashtags?: string[] | string;
      timezone?: string;
    };
    const settings = updateCreatorSocialSettings(address, body);
    return Response.json({ settings }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform") as SchedulablePlatform | null;
  if (!platform) {
    return Response.json(
      { error: "platform query parameter is required" },
      { status: 400 },
    );
  }
  try {
    const settings = disconnectSocialAccount(address, platform);
    return Response.json({ settings }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
