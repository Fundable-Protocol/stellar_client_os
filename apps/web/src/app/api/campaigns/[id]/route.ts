import { getCampaign, transitionCampaignStatus } from "../../../../services/campaign.service";
import { autoTranslate, detectLanguage, SUPPORTED_TRANSLATION_LOCALES } from "@/lib/translation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

const INSURANCE_RATE = 0.01;
const INSURANCE_WINDOW_YEARS = 2;
const DEAD_REFUND_RATE = 0.5;

function computeInsurancePool(fundsRaised: number): number {
  return Math.round(fundsRaised * INSURANCE_RATE * 100) / 100;
}

function computeInsuranceRefund(pool: number, deadTrees: number, totalTrees: number): number {
  if (totalTrees <= 0 || deadTrees <= 0) return 0;
  const ratio = Math.min(deadTrees / totalTrees, 1);
  return Math.round(pool * ratio * DEAD_REFUND_RATE * 100) / 100;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      fundsRaised?: number;
      deadTrees?: number;
      insuranceWindowEnded?: boolean;
    };
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
    if (body.fundsRaised !== undefined && (!Number.isFinite(body.fundsRaised) || body.fundsRaised < 0)) {
      return noStore({ error: "fundsRaised must be a non-negative number" }, { status: 400 });
    }
    if (body.deadTrees !== undefined && (!Number.isSafeInteger(body.deadTrees) || body.deadTrees < 0)) {
      return noStore({ error: "deadTrees must be a non-negative whole number" }, { status: 400 });
    }
    let updated = campaign;
    if (body.status) {
      if (!body.changedBy) return noStore({ error: "changedBy is required when changing status" }, { status: 400 });
      updated = await transitionCampaignStatus(campaign, body.status, body.changedBy, body.reason);
    }
    const fundsRaised = body.fundsRaised ?? updated.fundsRaised ?? 0;
    const insurancePool = computeInsurancePool(fundsRaised);
    const deadTrees = body.deadTrees ?? updated.deadTrees ?? 0;
    const totalTrees = body.treeCount ?? updated.treeCount ?? 0;
    const insuranceWindowEnded = body.insuranceWindowEnded ?? updated.insuranceWindowEnded ?? false;
    const insuranceRefund = insuranceWindowEnded
      ? computeInsuranceRefund(insurancePool, deadTrees, totalTrees)
      : 0;
    if (body.name !== undefined || body.description !== undefined || body.language !== undefined || body.translations !== undefined || body.autoTranslate !== undefined || body.treeCount !== undefined || body.co2Sequestration !== undefined || body.fundsRaised !== undefined || body.deadTrees !== undefined || body.insuranceWindowEnded !== undefined) {
      const language = body.language ?? updated.language ?? detectLanguage(body.description ?? updated.description ?? "");
      let translations = body.translations ?? updated.translations ?? {};
      const description = body.description ?? updated.description ?? "";
      if (body.autoTranslate) {
        translations = {
          ...autoTranslate(description, SUPPORTED_TRANSLATION_LOCALES),
          ...translations,
        };
      }
      updated = await (await import("@/services/campaign.service")).getCampaignDataSource().saveCampaign({
        ...updated,
        name: body.name ?? updated.name,
        description,
        language,
        translations,
        treeCount: body.treeCount ?? updated.treeCount,
        co2Sequestration: body.co2Sequestration ?? updated.co2Sequestration,
        fundsRaised,
        insurancePool,
        deadTrees,
        insuranceWindowEnded,
        insuranceWindowYears: INSURANCE_WINDOW_YEARS,
        insuranceRefund,
        updatedAt: Date.now(),
      });
    }
    return noStore(updated);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Invalid JSON request body" }, { status: 400 });
  }
}
