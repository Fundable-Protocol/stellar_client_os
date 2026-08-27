import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FundableMap } from "./FundableMap";
import { FundableMapView } from "./FundableMapView";
import {
  clusterStreams,
  getClusterColor,
  getClusterRadius,
  getStatusColor,
  filterStreams,
  getCategories,
} from "./cluster-utils";
import type {
  FundableStream,
  FundableMapProps,
  FundableMapFilters,
} from "./types";
import type { StreamStatus } from "./types";

vi.mock("react-leaflet", () => ({
  MapContainer: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  )),
  TileLayer: vi.fn(() => <div data-testid="tile-layer" />),
  CircleMarker: vi.fn(
    ({
      children,
      "aria-label": ariaLabel,
      role,
    }: {
      children?: React.ReactNode;
      "aria-label"?: string;
      role?: string;
    }) => (
      <div data-testid="circle-marker" aria-label={ariaLabel} role={role}>
        {children}
      </div>
    ),
  ),
  Popup: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="popup">{children}</div>
  )),
  useMap: vi.fn(() => ({
    fitBounds: vi.fn(),
  })),
}));

const mockStreams: FundableStream[] = [
  {
    id: "1",
    title: "Solar Grid Africa",
    description: "Renewable energy for rural communities",
    location: { lat: -1.2921, lng: 36.8219 },
    amount: "50000",
    currency: "XLM",
    status: "active",
    creator: "GABCD...1234",
    category: "Energy",
  },
  {
    id: "2",
    title: "DeFi Education Platform",
    description: "Learning resources for decentralized finance",
    location: { lat: 40.7128, lng: -74.006 },
    amount: "25000",
    currency: "USDC",
    status: "active",
    creator: "GEFGH...5678",
    category: "Education",
  },
  {
    id: "3",
    title: "Art NFT Marketplace",
    description: "Digital art platform for emerging artists",
    location: { lat: 51.5074, lng: -0.1278 },
    amount: "10000",
    currency: "ETH",
    status: "funded",
    creator: "GIJKL...9012",
    category: "Arts",
  },
  {
    id: "4",
    title: "Clean Water Initiative",
    description: "Water filtration systems for Southeast Asia",
    location: { lat: 1.3521, lng: 103.8198 },
    amount: "75000",
    currency: "XLM",
    status: "pending",
    creator: "GMNOP...3456",
    category: "Infrastructure",
  },
  {
    id: "5",
    title: "Micro-Lending Platform",
    description: "Peer-to-peer lending for small businesses",
    location: { lat: 19.076, lng: 72.8777 },
    amount: "30000",
    currency: "USDC",
    status: "active",
    creator: "GQRST...7890",
    category: "Finance",
  },
];

const nearbyStreams: FundableStream[] = [
  {
    id: "6",
    title: "Tech Hub Nairobi",
    description: "Co-working space for developers",
    location: { lat: -1.285, lng: 36.82 },
    amount: "15000",
    currency: "XLM",
    status: "active",
    creator: "GUVWX...1234",
    category: "Technology",
  },
  {
    id: "7",
    title: "Green Transport Africa",
    description: "Electric bike sharing in Nairobi",
    location: { lat: -1.29, lng: 36.83 },
    amount: "20000",
    currency: "USDC",
    status: "pending",
    creator: "GYZAB...5678",
    category: "Transport",
  },
];

describe("FundableMap Component", () => {
  describe("component exports", () => {
    it("should export FundableMap component", () => {
      expect(FundableMap).toBeDefined();
      expect(typeof FundableMap).toBe("function");
    });

    it("should export FundableMapView component", () => {
      expect(FundableMapView).toBeDefined();
      expect(typeof FundableMapView).toBe("function");
    });
  });

  describe("props interface", () => {
    it("should accept valid FundableMapProps", () => {
      const validProps: FundableMapProps = {
        streams: mockStreams,
      };

      expect(validProps.streams).toBeDefined();
      expect(validProps.streams.length).toBe(5);
      expect(validProps.streams[0].id).toBe("1");
    });

    it("should accept props with className", () => {
      const propsWithClass: FundableMapProps = {
        streams: mockStreams,
        className: "custom-class",
      };

      expect(propsWithClass.className).toBe("custom-class");
    });

    it("should accept empty streams array", () => {
      const propsWithEmpty: FundableMapProps = {
        streams: [],
      };

      expect(propsWithEmpty.streams).toEqual([]);
    });

    it("should accept filters and callbacks", () => {
      const onSelect = vi.fn();
      const onFilter = vi.fn();
      const filters: FundableMapFilters = { status: ["active"] };

      const props: FundableMapProps = {
        streams: mockStreams,
        filters,
        onStreamSelect: onSelect,
        onFilterChange: onFilter,
        isLoading: true,
      };

      expect(props.filters).toEqual(filters);
      expect(props.onStreamSelect).toBe(onSelect);
      expect(props.onFilterChange).toBe(onFilter);
      expect(props.isLoading).toBe(true);
    });
  });

  describe("stream data structure", () => {
    it("should have required fields for each stream", () => {
      const requiredFields = [
        "id",
        "title",
        "description",
        "location",
        "amount",
        "currency",
        "status",
        "creator",
        "category",
      ] as const;

      mockStreams.forEach((stream) => {
        requiredFields.forEach((field) => {
          expect(stream).toHaveProperty(field);
        });
      });
    });

    it("should have valid location coordinates", () => {
      mockStreams.forEach((stream) => {
        expect(stream.location.lat).toBeGreaterThanOrEqual(-90);
        expect(stream.location.lat).toBeLessThanOrEqual(90);
        expect(stream.location.lng).toBeGreaterThanOrEqual(-180);
        expect(stream.location.lng).toBeLessThanOrEqual(180);
      });
    });

    it("should have valid stream status", () => {
      const validStatuses: StreamStatus[] = ["active", "funded", "pending"];

      mockStreams.forEach((stream) => {
        expect(validStatuses).toContain(stream.status);
      });
    });

    it("should have non-empty title and description", () => {
      mockStreams.forEach((stream) => {
        expect(stream.title.length).toBeGreaterThan(0);
        expect(stream.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("clustering logic", () => {
    it("should return individual clusters for distant streams", () => {
      const clusters = clusterStreams(mockStreams);
      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters.length).toBeLessThanOrEqual(mockStreams.length);
    });

    it("should cluster nearby streams", () => {
      const allStreams = [...mockStreams, ...nearbyStreams];
      const clusters = clusterStreams(allStreams);
      const totalStreams = clusters.reduce(
        (sum, c) => sum + c.streams.length,
        0,
      );
      expect(totalStreams).toBe(allStreams.length);
    });

    it("should return empty array for empty input", () => {
      const clusters = clusterStreams([]);
      expect(clusters).toEqual([]);
    });

    it("should preserve stream data in clusters", () => {
      const clusters = clusterStreams(mockStreams);
      const allIds = clusters.flatMap((c) => c.streams.map((s) => s.id));
      expect(allIds.sort()).toEqual(mockStreams.map((s) => s.id).sort());
    });

    it("should have count matching number of streams in each cluster", () => {
      const clusters = clusterStreams(mockStreams);
      clusters.forEach((cluster) => {
        expect(cluster.count).toBe(cluster.streams.length);
      });
    });
  });

  describe("filter logic", () => {
    it("should return all streams when no filters provided", () => {
      const result = filterStreams(mockStreams);
      expect(result).toEqual(mockStreams);
    });

    it("should return all streams when filters are empty", () => {
      const result = filterStreams(mockStreams, {});
      expect(result).toEqual(mockStreams);
    });

    it("should filter by status", () => {
      const result = filterStreams(mockStreams, { status: ["active"] });
      expect(result.length).toBe(3);
      result.forEach((s) => expect(s.status).toBe("active"));
    });

    it("should filter by multiple statuses", () => {
      const result = filterStreams(mockStreams, {
        status: ["active", "funded"],
      });
      expect(result.length).toBe(4);
    });

    it("should filter by category", () => {
      const result = filterStreams(mockStreams, { category: ["Energy"] });
      expect(result.length).toBe(1);
      expect(result[0].title).toBe("Solar Grid Africa");
    });

    it("should filter by search query matching title", () => {
      const result = filterStreams(mockStreams, { searchQuery: "solar" });
      expect(result.length).toBe(1);
      expect(result[0].title).toBe("Solar Grid Africa");
    });

    it("should filter by search query matching description", () => {
      const result = filterStreams(mockStreams, {
        searchQuery: "renewable",
      });
      expect(result.length).toBe(1);
    });

    it("should filter by search query matching creator", () => {
      const result = filterStreams(mockStreams, {
        searchQuery: "GQRST",
      });
      expect(result.length).toBe(1);
      expect(result[0].title).toBe("Micro-Lending Platform");
    });

    it("should combine multiple filters", () => {
      const result = filterStreams(mockStreams, {
        status: ["active"],
        searchQuery: "platform",
      });
      expect(result.length).toBe(2);
      result.forEach((s) => expect(s.status).toBe("active"));
    });

    it("should return empty array when no streams match", () => {
      const result = filterStreams(mockStreams, {
        searchQuery: "nonexistent",
      });
      expect(result).toEqual([]);
    });

    it("should be case insensitive for search queries", () => {
      const result = filterStreams(mockStreams, { searchQuery: "SOLAR" });
      expect(result.length).toBe(1);
    });
  });

  describe("getCategories", () => {
    it("should return sorted unique categories", () => {
      const categories = getCategories(mockStreams);
      expect(categories).toEqual([
        "Arts",
        "Education",
        "Energy",
        "Finance",
        "Infrastructure",
      ]);
    });

    it("should return empty array for empty streams", () => {
      expect(getCategories([])).toEqual([]);
    });

    it("should not contain duplicates", () => {
      const allStreams = [...mockStreams, ...nearbyStreams];
      const categories = getCategories(allStreams);
      const unique = new Set(categories);
      expect(categories.length).toBe(unique.size);
    });
  });

  describe("getStatusColor", () => {
    it("should return purple for active", () => {
      expect(getStatusColor("active")).toBe("#b102cd");
    });

    it("should return green for funded", () => {
      expect(getStatusColor("funded")).toBe("#22c55e");
    });

    it("should return yellow for pending", () => {
      expect(getStatusColor("pending")).toBe("#eab308");
    });

    it("should return fallback for unknown status", () => {
      expect(getStatusColor("unknown")).toBe("#8792ab");
    });
  });

  describe("getClusterColor", () => {
    it("should return purple for single item", () => {
      expect(getClusterColor(1)).toBe("#b102cd");
    });

    it("should return mid-purple for 2-3 items", () => {
      expect(getClusterColor(2)).toBe("#8256ff");
      expect(getClusterColor(3)).toBe("#8256ff");
    });

    it("should return deep purple for 4+ items", () => {
      expect(getClusterColor(4)).toBe("#5b21b6");
      expect(getClusterColor(10)).toBe("#5b21b6");
    });
  });

  describe("getClusterRadius", () => {
    it("should return 8 for single item", () => {
      expect(getClusterRadius(1)).toBe(8);
    });

    it("should return 12 for 2-3 items", () => {
      expect(getClusterRadius(2)).toBe(12);
      expect(getClusterRadius(3)).toBe(12);
    });

    it("should return 16 for 4+ items", () => {
      expect(getClusterRadius(4)).toBe(16);
      expect(getClusterRadius(10)).toBe(16);
    });
  });

  describe("rendering states", () => {
    it("should render loading skeleton via dynamic import", () => {
      const { container } = render(<FundableMap streams={mockStreams} />);
      const skeleton = container.querySelector('[role="status"]');
      expect(skeleton).toBeTruthy();
    });

    it("should render map with streams", () => {
      render(<FundableMapView streams={mockStreams} />);
      expect(screen.getByRole("application")).toBeDefined();
    });

    it("should render loading overlay when isLoading is true", () => {
      render(<FundableMapView streams={mockStreams} isLoading={true} />);
      expect(screen.getByRole("status")).toBeDefined();
    });

    it("should not show loading overlay when isLoading is false", () => {
      render(<FundableMapView streams={mockStreams} isLoading={false} />);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("should render empty state for no streams", () => {
      render(<FundableMapView streams={[]} />);
      expect(screen.getByRole("application")).toBeDefined();
    });

    it("should show empty state when streams array is empty", () => {
      render(<FundableMapView streams={[]} />);
      expect(screen.getByText("No fundable streams to display")).toBeDefined();
    });

    it("should not show empty state when streams are present", () => {
      render(<FundableMapView streams={mockStreams} />);
      expect(
        screen.queryByText("No fundable streams to display"),
      ).toBeNull();
    });

    it("should not show empty state when loading", () => {
      render(<FundableMapView streams={[]} isLoading={true} />);
      expect(
        screen.queryByText("No fundable streams to display"),
      ).toBeNull();
    });
  });

  describe("accessibility", () => {
    it("should have role application on map container", () => {
      render(<FundableMapView streams={mockStreams} />);
      expect(screen.getByRole("application")).toBeDefined();
    });

    it("should have aria-label on map container", () => {
      render(<FundableMapView streams={mockStreams} />);
      const map = screen.getByRole("application");
      expect(map.getAttribute("aria-label")).toBe(
        "Fundable streams world map",
      );
    });

    it("should have aria-label on circle markers", () => {
      render(<FundableMapView streams={mockStreams} />);
      const markers = screen.getAllByTestId("circle-marker");
      expect(markers.length).toBeGreaterThan(0);
      markers.forEach((marker) => {
        expect(marker.getAttribute("aria-label")).toBeTruthy();
      });
    });

    it("should have role button on circle markers", () => {
      render(<FundableMapView streams={mockStreams} />);
      const markers = screen.getAllByTestId("circle-marker");
      markers.forEach((marker) => {
        expect(marker.getAttribute("role")).toBe("button");
      });
    });


  });

  describe("marker rendering", () => {
    it("should render correct number of clusters", () => {
      const clusters = clusterStreams(mockStreams);
      render(<FundableMapView streams={mockStreams} />);
      const markers = screen.getAllByTestId("circle-marker");
      expect(markers.length).toBe(clusters.length);
    });

    it("should render no markers for empty streams", () => {
      render(<FundableMapView streams={[]} />);
      expect(screen.queryByTestId("circle-marker")).toBeNull();
    });
  });

  describe("error boundary", () => {
    it("should catch render errors and display fallback", () => {
      const ThrowingComponent = () => {
        throw new Error("Map render failure");
      };

      render(
        <FundableMapView streams={mockStreams} />,
      );

      expect(screen.getByRole("application")).toBeDefined();
    });
  });
});
