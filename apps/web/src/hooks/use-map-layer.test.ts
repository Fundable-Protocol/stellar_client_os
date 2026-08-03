import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapLayer } from "./use-map-layer";

describe("useMapLayer", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initialises with vector layer", () => {
    const { result } = renderHook(() => useMapLayer());
    expect(result.current.layer).toBe("vector");
  });

  it("reads persisted layer from sessionStorage", () => {
    sessionStorage.setItem("fundable-map-layer", "satellite");
    const { result } = renderHook(() => useMapLayer());
    expect(result.current.layer).toBe("satellite");
  });

  it("falls back to vector for invalid stored values", () => {
    sessionStorage.setItem("fundable-map-layer", "invalid");
    const { result } = renderHook(() => useMapLayer());
    expect(result.current.layer).toBe("vector");
  });

  it("switches to satellite layer", () => {
    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.setLayer("satellite");
    });

    expect(result.current.layer).toBe("satellite");
  });

  it("toggles between vector and satellite", () => {
    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.toggleLayer();
    });

    expect(result.current.layer).toBe("satellite");

    act(() => {
      result.current.toggleLayer();
    });

    expect(result.current.layer).toBe("vector");
  });

  it("persists layer to sessionStorage", () => {
    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.setLayer("satellite");
    });

    expect(sessionStorage.getItem("fundable-map-layer")).toBe("satellite");
  });

  it("sets isSwitching to true on layer change", () => {
    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.setLayer("satellite");
    });

    expect(result.current.isSwitching).toBe(true);
  });

  it("clears isSwitching after timeout", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.setLayer("satellite");
    });

    expect(result.current.isSwitching).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.isSwitching).toBe(false);

    vi.useRealTimers();
  });

  it("clears error when setLayer is called", () => {
    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.setLayer("satellite");
    });

    expect(result.current.error).toBeNull();
  });

  it("provides clearError function that clears the error", () => {
    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.setLayer("satellite");
    });

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it("handles sessionStorage write failure gracefully", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage full");
    });

    const { result } = renderHook(() => useMapLayer());

    act(() => {
      result.current.setLayer("satellite");
    });

    expect(result.current.layer).toBe("satellite");
  });

  it("handles sessionStorage read failure gracefully", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage error");
    });

    const { result } = renderHook(() => useMapLayer());
    expect(result.current.layer).toBe("vector");
  });
});
