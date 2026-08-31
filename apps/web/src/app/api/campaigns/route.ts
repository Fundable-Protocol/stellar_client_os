import { createCampaign, findDuplicateCampaigns, queryCampaigns } from "@/services/campaign.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as never;
  const creator = url.searchParams.get("creator") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const campaigns = await queryCampaigns({
    filter: { status: status || undefined, creator, search },
    sort: { field: (url.searchParams.get("sort") as never) || "createdAt", direction: url.searchParams.get("direction") === "asc" ? "ASC" : "DESC" },
    limit: Number.isFinite(limit) ? limit : 20,
    offset: Number.isFinite(offset) ? offset : 0,
    network: (url.searchParams.get("network") as "testnet" | "mainnet" | null) ?? undefined,
  });
  return Response.json({ data: campaigns, pagination: { limit, offset, count: campaigns.length } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      creator?: string;
      name?: string;
      description?: string;
      location?: string;
      durationMs?: number;
      deadline?: number;
      goalAmount?: string;
      network?: "testnet" | "mainnet";
    };
    if (!body.creator || !body.name || !body.goalAmount) {
      return Response.json({ error: "creator, name, and goalAmount are required" }, { status: 400 });
    }
    if (!/^\d+$/.test(body.goalAmount)) {
      return Response.json({ error: "goalAmount must be a non-negative integer string" }, { status: 400 });
    }
    if (body.location !== undefined && typeof body.location !== "string") {
      return Response.json({ error: "location must be a string" }, { status: 400 });
    }
    if (body.durationMs !== undefined && (!Number.isFinite(body.durationMs) || body.durationMs < 0)) {
      return Response.json({ error: "durationMs must be a non-negative number" }, { status: 400 });
    }
    if (body.deadline !== undefined && !Number.isFinite(body.deadline)) {
      return Response.json({ error: "deadline must be a numeric timestamp" }, { status: 400 });
    }
    const durationMs = body.durationMs ?? (body.deadline !== undefined ? body.deadline - Date.now() : undefined);
    if (durationMs !== undefined && durationMs < 0) {
      return Response.json({ error: "deadline must be in the future" }, { status: 400 });
    }
    const duplicates = await findDuplicateCampaigns({
      creator: body.creator,
      name: body.name,
      location: body.location,
      durationMs,
    });
    if (duplicates.length > 0) {
      return Response.json(
        { error: "A campaign with the same name, location, and duration already exists", duplicates },
        { status: 409 },
      );
    }
    const campaign = await createCampaign({
      creator: body.creator,
      name: body.name,
      description: body.description,
      location: body.location,
      durationMs,
      goalAmount: body.goalAmount,
      network: body.network,
    });
    return Response.json(campaign, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}
