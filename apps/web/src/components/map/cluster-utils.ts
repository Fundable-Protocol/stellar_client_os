import type {
  FundableStream,
  StreamCluster,
  FundableMapFilters,
  JobSortOption,
} from "./types";

export function getClusterColor(count: number): string {
  if (count === 1) return "#b102cd";
  if (count <= 3) return "#8256ff";
  return "#5b21b6";
}

export function getClusterRadius(count: number): number {
  if (count === 1) return 8;
  if (count <= 3) return 12;
  return 16;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "#b102cd";
    case "funded":
      return "#22c55e";
    case "pending":
      return "#eab308";
    default:
      return "#8792ab";
  }
}

export function clusterStreams(streams: FundableStream[]): StreamCluster[] {
  if (streams.length === 0) return [];

  const stridSize = 2;
  const buckets = new Map<string, FundableStream[]>();

  for (const stream of streams) {
    const lat = Math.round(stream.location.lat / gridSize) * gridSize;
    const lng = Math.round(stream.location.lng / gridSize) * gridSize;
    const key = `${lat},${lng}`;

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(stream);
  }

  return Array.from(buckets.entries()).map(([key, items]) => {
    const [latStr, lngStr] = key.split(",");
    return {
      id: `cluster-${key}`,
      latitude: items.reduce((s, i) => s + i.location.lat, 0) / items.length,
      longitude: items.reduce((s, i) => s + i.location.lng, 0) / items.length,
      count: items.length,
      streams: items,
    };
  });
}

export function filterStreams(
  streams: FundableStream[],
  filters?: FundableMapFilters,
): FundableStream[] {
  if (!filters) return streams;
  let filtered = [...streams];

  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter((s) => filters.status!.includes(s.status));
  }

  if (filters.category && filters.category.length > 0) {
    filtered = filtered.filter((s) => filters.category!.includes(s.category));
  }

  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.creator.toLowerCase().includes(q),
    );
  }

  return filtered;
}

export function getCategories(streams: FundableStream[]): string[] {
  return [...new Set(streams.map((s) => s.category))].sort();
}

/**
 * Sort streams by a job-board sort option.
 *
 * - "pay"       -> highest pay first (uses `payRate`, falling back to `amount`)
 * - "deadline"  -> soonest deadline first (missing deadlines go last)
 * - "altitude"  -> lowest altitude first (missing altitudes go last)
 */
export function sortStreams(
  streams: FundableStream[],
  sortBy: JobSortOption,
): FundableStream[] {
  const sorted = [...streams];

  switch (sortBy) {
    case "pay": {
      sorted.sort((a, b) => {
        const aPay = a.payRate ?? parseFloat(a.amount) || 0;
        const bPay = b.payRate ?? parseFloat(b.amount) || 0;
        return bPay - aPay;
      });
      break;
    }
    case "deadline": {
      sorted.sort((a, b) => {
        const aTime = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bTime = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return aTime - bTime;
      });
      break;
    }
    case "altitude": {
      sorted.sort((a, b) => (a.altitude ?? Infinity) - (b.altitude ?? Infinity));
      break;
    }
  }

  return sorted;
}
