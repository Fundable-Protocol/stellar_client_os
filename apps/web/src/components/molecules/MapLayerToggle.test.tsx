import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapLayerToggle } from "./MapLayerToggle";

describe("MapLayerToggle", () => {
  it("renders both layer buttons", () => {
    render(
      <MapLayerToggle layer="vector" onLayerChange={() => {}} />
    );

    expect(screen.getByRole("radio", { name: /street view/i })).toBeDefined();
    expect(
      screen.getByRole("radio", { name: /satellite view/i })
    ).toBeDefined();
  });

  it("highlights the active layer", () => {
    render(
      <MapLayerToggle layer="satellite" onLayerChange={() => {}} />
    );

    const satellite = screen.getByRole("radio", { name: /satellite view/i });
    const street = screen.getByRole("radio", { name: /street view/i });

    expect(satellite.getAttribute("aria-checked")).toBe("true");
    expect(street.getAttribute("aria-checked")).toBe("false");
  });

  it("calls onLayerChange when clicking a layer button", () => {
    const onLayerChange = vi.fn();
    render(
      <MapLayerToggle layer="vector" onLayerChange={onLayerChange} />
    );

    fireEvent.click(screen.getByRole("radio", { name: /satellite view/i }));

    expect(onLayerChange).toHaveBeenCalledWith("satellite");
  });

  it("disables buttons when disabled prop is true", () => {
    render(
      <MapLayerToggle
        layer="vector"
        onLayerChange={() => {}}
        disabled={true}
      />
    );

    const buttons = screen.getAllByRole("radio");
    buttons.forEach((button) => {
      expect(button.hasAttribute("disabled")).toBe(true);
    });
  });

  it("disables buttons while switching layers", () => {
    render(
      <MapLayerToggle
        layer="vector"
        onLayerChange={() => {}}
        isSwitching={true}
      />
    );

    const buttons = screen.getAllByRole("radio");
    buttons.forEach((button) => {
      expect(button.hasAttribute("disabled")).toBe(true);
    });
  });

  it("shows spinner when isSwitching is true", () => {
    render(
      <MapLayerToggle
        layer="vector"
        onLayerChange={() => {}}
        isSwitching={true}
      />
    );

    expect(screen.getByRole("status", { name: /switching layer/i })).toBeDefined();
  });

  it("does not show spinner when isSwitching is false", () => {
    render(
      <MapLayerToggle
        layer="vector"
        onLayerChange={() => {}}
        isSwitching={false}
      />
    );

    expect(
      screen.queryByRole("status", { name: /switching layer/i })
    ).toBeNull();
  });

  it("has correct radiogroup aria role", () => {
    render(
      <MapLayerToggle layer="vector" onLayerChange={() => {}} />
    );

    const group = screen.getByRole("radiogroup");
    expect(group).toBeDefined();
    expect(group.getAttribute("aria-label")).toBe("Map layer");
  });

  it("supports keyboard navigation", () => {
    const onLayerChange = vi.fn();
    render(
      <MapLayerToggle layer="vector" onLayerChange={onLayerChange} />
    );

    const satellite = screen.getByRole("radio", { name: /satellite view/i });
    satellite.focus();
    fireEvent.click(satellite);

    expect(onLayerChange).toHaveBeenCalledWith("satellite");
  });

  it("renders icons with aria-hidden", () => {
    render(
      <MapLayerToggle layer="vector" onLayerChange={() => {}} />
    );

    const icons = document.querySelectorAll("[aria-hidden='true']");
    expect(icons.length).toBeGreaterThan(0);
  });
});
