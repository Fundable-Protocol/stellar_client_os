import { getPartnershipDataSource } from "@/services/campaign-partnership.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function noStore<T>(body: T, init?: ResponseInit): Response {
  return Response.json(body, { ...init, headers: { ...NO_STORE_HEADERS, ...(init?.headers ?? {}) } });
}

export async function GET() {
  try {
    const dataSource = getPartnershipDataSource();
    const ngos = await dataSource.getNGOs();
    return noStore(ngos);
  } catch (error) {
    return noStore({ error: error instanceof Error ? error.message : "Failed to fetch NGOs" }, { status: 500 });
  }
}
