import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ImpactMap } from "./ImpactMap";

// ---------------------------------------------------------------------------
// Mock maplibre-gl – jsdom has no WebGL so we supply a fake Map
// ---------------------------------------------------------------------------
const { MockMap, mockOn, mockRemove, mockAddSource, mockAddLayer } = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockRemove = vi.fn();
  const mockAddSource = vi.fn();
  const mockAddLayer = vi.fn();

  const MockMap = vi.fn().mockImplementation(() => ({
    on: mockOn,
    remove: mockRemove,
    addSource: mockAddSource,
    addLayer: mockAddLayer,
    getSource: vi.fn().mockReturnValue(null),
    getLayer: vi.fn().mockReturnValue(null),
    removeSource: vi.fn(),
    removeLayer: vi.fn(),
  }));

  return { MockMap, mockOn, mockRemove, mockAddSource, mockAddLayer };
});

vi.mock("maplibre-gl", () => ({
  default: {
    Map: MockMap,
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireMapLoad() {
  const call = mockOn.mock.calls.find(([e]: [string]) => e === "load");
  if (call) call[1]();
}

function fireMapError() {
  const call = mockOn.mock.calls.find(([e]: [string]) => e === "error");
  if (call) call[1]({ error: { status: 404, message: "Tile not found" } });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImpactMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the map container", () => {
    render(<ImpactMap />);
    expect(screen.getByLabelText("Impact projects map")).toBeDefined();
  });

  it("renders the layer toggle", () => {
    render(<ImpactMap />);
    expect(screen.getByRole("radiogroup", { name: /map layer/i })).toBeDefined();
  });

  it("shows loading skeleton before map loads", () => {
    render(<ImpactMap />);
    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });

  it("hides skeleton after map loads", async () => {
    render(<ImpactMap />);

    await act(async () => {
      fireMapLoad();
    });

    await waitFor(() => {
      expect(document.querySelectorAll("[data-slot='skeleton']").length).toBe(0);
    });
  });

  it("shows loading overlay when switching layers", async () => {
    render(<ImpactMap />);

    await act(async () => {
      fireMapLoad();
    });

    const satelliteBtn = screen.getByRole("radio", { name: /satellite view/i });
    await act(async () => {
      fireEvent.click(satelliteBtn);
    });

    expect(screen.getByRole("status", { name: /switching map layer/i })).toBeDefined();
  });

  it("handles tile loading errors gracefully", async () => {
    render(<ImpactMap />);

    await act(async () => {
      fireMapLoad();
    });

    await act(async () => {
      fireMapError();
    });

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/failed to load map tiles/i)).toBeDefined();
  });

  it("disables toggle before map loads", () => {
    render(<ImpactMap />);

    const buttons = screen.getAllByRole("radio");
    buttons.forEach((button) => {
      expect(button.hasAttribute("disabled")).toBe(true);
    });
  });

  it("enables toggle after map loads", async () => {
    render(<ImpactMap />);

    await act(async () => {
      fireMapLoad();
    });

    await waitFor(() => {
      const buttons = screen.getAllByRole("radio");
      buttons.forEach((button) => {
        expect(button.hasAttribute("disabled")).toBe(false);
      });
    });
  });

  it("allows retrying after tile error", async () => {
    render(<ImpactMap />);

    await act(async () => {
      fireMapLoad();
    });

    await act(async () => {
      fireMapError();
    });

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("switches map source when layer changes", async () => {
    render(<ImpactMap />);

    await act(async () => {
      fireMapLoad();
    });

    const satelliteBtn = screen.getByRole("radio", { name: /satellite view/i });
    await act(async () => {
      fireEvent.click(satelliteBtn);
    });

    await waitFor(() => {
      expect(mockAddSource).toHaveBeenCalled();
      expect(mockAddLayer).toHaveBeenCalled();
    });
  });

  it("applies custom className", () => {
    const { container } = render(<ImpactMap className="custom-class" />);
    const section = container.querySelector("section");
    expect(section?.classList.contains("custom-class")).toBe(true);
  });

  it("cleans up map on unmount", () => {
    const { unmount } = render(<ImpactMap />);
    unmount();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
