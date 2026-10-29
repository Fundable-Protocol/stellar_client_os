import {
  BackerDigestValidationError,
  getBackerDigestPreference,
  setBackerDigestPreference,
} from "@/services/backer-digest.service";

export const runtime = "nodejs";

/** GET /api/backers/digest-preferences?backerId=... */
export async function GET(request: Request) {
  const backerId = new URL(request.url).searchParams.get("backerId")?.trim();
  if (!backerId) {
    return Response.json({ error: "backerId is required" }, { status: 400 });
  }
  const preference = await getBackerDigestPreference(backerId);
  return Response.json({
    preference: preference ?? { backerId, frequency: "off", timezone: "UTC" },
  });
}

/** PUT /api/backers/digest-preferences — body: { backerId, frequency, email?, timezone? } */
export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const preference = await setBackerDigestPreference({
      backerId: String(body.backerId ?? ""),
      frequency: body.frequency as "off" | "daily" | "weekly",
      email: typeof body.email === "string" ? body.email : undefined,
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
    });
    return Response.json({ preference });
  } catch (err) {
    if (err instanceof BackerDigestValidationError) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    return Response.json({ error: "failed to save preference" }, { status: 500 });
  }
}
