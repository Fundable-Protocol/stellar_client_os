"use client";

export interface OfflineCampaignRecord {
  id: string;
  name: string;
  description: string;
  location: string;
  goalAmount: string;
  raisedAmount: string;
  treeCount: number | null;
  status: string;
  deadline: number | null;
  updatedAt: number;
  url: string;
}

const DATABASE_NAME = "fundable-offline";
const DATABASE_VERSION = 1;
const CAMPAIGN_STORE = "campaigns";

function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CAMPAIGN_STORE)) {
        database.createObjectStore(CAMPAIGN_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("apiResponses")) {
        database.createObjectStore("apiResponses", { keyPath: "url" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline storage"));
  });
}

/**
 * Whitelist the fields safe and useful for offline browsing. Never persist
 * creator email, wallet/session data, donation details, or other API fields.
 */
export function toOfflineCampaignRecord(value: unknown): OfflineCampaignRecord | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;
  const candidate =
    source.data && typeof source.data === "object" && !Array.isArray(source.data)
      ? (source.data as Record<string, unknown>)
      : source;
  const rawId = candidate.id ?? candidate.campaignId;
  if ((typeof rawId !== "string" && typeof rawId !== "number") || !String(rawId).trim()) {
    return null;
  }

  const asText = (input: unknown): string => {
    if (typeof input === "string") return input.slice(0, 10000);
    if (typeof input === "number" && Number.isFinite(input)) return String(input);
    return "";
  };
  const id = String(rawId).trim();

  return {
    id,
    name: asText(candidate.name || candidate.title) || "Untitled campaign",
    description: asText(candidate.description),
    location: asText(candidate.location),
    goalAmount: asText(candidate.goalAmount),
    raisedAmount: asText(candidate.raisedAmount),
    treeCount:
      typeof candidate.treeCount === "number" && Number.isFinite(candidate.treeCount)
        ? candidate.treeCount
        : null,
    status: asText(candidate.status),
    deadline:
      typeof candidate.deadline === "number" && Number.isFinite(candidate.deadline)
        ? candidate.deadline
        : null,
    updatedAt: Date.now(),
    url: "/campaigns/" + encodeURIComponent(id),
  };
}

export async function saveOfflineCampaign(value: unknown): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return;
  const record = toOfflineCampaignRecord(value);
  if (!record) return;

  const database = await openOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CAMPAIGN_STORE, "readwrite");
      transaction.objectStore(CAMPAIGN_STORE).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Unable to save offline campaign"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Offline campaign save was aborted"));
    });
  } finally {
    database.close();
  }
}
