export interface StreamLocation {
  lat: number;
  lng: number;
}

export type StreamStatus = "active" | "funded" | "pending";

export interface FundableStream {
  id: string;
  title: string;
  description: string;
  location: StreamLocation;
  amount: string;
  currency: string;
  status: StreamStatus;
  creator: string;
  category: string;
  payRate?: number;
  deadline?: string;
  altitude?: number;
}

export type JobSortOption = "pay" | "deadline" | "altitude";

export interface StreamCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  streams: FundableStream[];
}

export interface FundableMapFilters {
  status?: StreamStatus[];
  category?: string[];
  searchQuery?: string;
}

export interface FundableMapProps {
  streams: FundableStream[];
  className?: string;
  filters?: FundableMapFilters;
  onStreamSelect?: (stream: FundableStream) => void;
  onFilterChange?: (filters: FundableMapFilters) => void;
  isLoading?: boolean;
}
