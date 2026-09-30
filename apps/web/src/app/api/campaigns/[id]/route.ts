import { getCampaign, transitionCampaignStatus } from "../../../../services/campaign.service";
import {
  detectLanguage,
  hasOnlySupportedTranslationLocales,
  isSupportedTranslationLocale,
} from "@/lib/translation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export async function GET((_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaign = await getCampaign((await params).id);
  return campaign ? noStore(campaign) : noStore({ error: "Campaign not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const campaign = await getCampaign(id);
  if (!campaign) return noStore({ error: "Campaign not found" }, { status: 404 });

  try {
    const body = await request.json() as {
      status?: never;
      changedBy?: string;
      reason?: string;
      name?: string;
      description?: string;
      language?: string;
      translations?: Record<string, string>;
      autoTranslate?: boolean;
      treeCount?: number;
      co2Sequestration?: string;
    };
    if (body.language && !isSupportedTranslationLocale(body.language)) {
      return noStore({ error: "language is not supported" }, { status: 400 });
    }
    if (body.translations && !hasOnlySupportedTranslationLocales(body.translations)) {
      return noStore({ error: "translations contain an unsupported language" }, { status: 400 });
    }
    if (body.autoTranslate) {
      return noStore(
        { error: "Automatic translation is unavailable. Provide translations for the supported languages." },
        { status: 501 },
      );
    if (body.treeCount !== undefined && (!Number.isSafeInteger(body.treeCount) || body.treeCount < 0)) {
      return noStore({ error: "treeCount must be a non-negative whole number" }, { status: 400 });
    }
    if (body.co2Sequestration !== undefined && (
      typeof body.co2Sequestration !== "string" ||
      !/^\d+(?:\.\d+)?$/.test(body.co2Sequestration) ||
      !Number.isFinite(Number(body.co2Sequestration))
    )) {
      return noStore({ error: "co2Sequestration must be a non-negative decimal string in metric tonnes" }, { status: 400 });
    }
    let updated = campaign;
    if (body.status) {
      if (!body.changedBy) return noStore({ error: "changedBy is required when changing status" }, { status: 400 });
      updated = await transitionCampaignStatus(campaign, body.status, body.changedBy, body.reason);
    }
    if (body.name !== undefined || body.description !== undefined || body.language !== undefined || body.translations !== undefined || body.autoTranslate !== undefined || body.treeCount !== undefined || body.co2Sequestration !== undefined) {
      const language = body.language ?? updated.language ?? detectLanguage(body.description ?? updated.description ?? "");
      const translations = body.translations ?? updated.translations ?? {};
      const description = body.description ?? updated.description ?? "";
      updated = await (await import("@/services/campaign.service")).getCampaignDataSource().saveCampaign({
        ...updated,
        name: body.name ?? updated.name,
        description,
        language,
        translations,
        treeCount: body.treeCount ?? updated.treeCount,
        co2Sequestration: body.co2Sequestration ?? updated.co2Sequestration,
        updatedAt: Date.now(),
      });
    }
    return noStore(updated);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Invalid JSON request body" }, { status: 400 });
  }
}
