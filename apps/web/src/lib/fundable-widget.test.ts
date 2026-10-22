/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";

const componentScript = readFileSync(
  resolve(process.cwd(), "public", "fundable-widget.js"),
  "utf8",
);

describe("<fundable-widget>", () => {
  beforeAll(() => {
    window.eval(componentScript);
  });

  it("renders an iframe and honors an explicit dark theme", () => {
    const widget = document.createElement("fundable-widget");
    widget.setAttribute("campaign-id", "campaign-123");
    widget.setAttribute("theme", "dark");
    document.body.append(widget);

    const frame = widget.shadowRoot?.querySelector("iframe");
    expect(frame?.src).toContain(
      "/api/campaigns/campaign-123/widget?theme=dark",
    );
    expect(widget.shadowRoot?.querySelector(".loading")?.textContent).toContain(
      "Loading campaign widget",
    );
    widget.remove();
  });

  it("adapts auto theme from the host document and rejects invalid campaign ids", () => {
    document.documentElement.classList.add("dark");
    const widget = document.createElement("fundable-widget");
    widget.setAttribute("campaign-id", "campaign-123");
    document.body.append(widget);
    expect(widget.shadowRoot?.querySelector("iframe")?.src).toContain("theme=dark");
    widget.remove();
    document.documentElement.classList.remove("dark");

    const invalid = document.createElement("fundable-widget");
    invalid.setAttribute("campaign-id", "../private");
    document.body.append(invalid);
    expect(invalid.shadowRoot?.querySelector("iframe")?.getAttribute("src")).toBeNull();
    expect(invalid.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
      "valid campaign-id",
    );
    invalid.setAttribute("campaign-id", "fixed-id");
    expect(invalid.shadowRoot?.querySelector("iframe")?.src).toContain(
      "/api/campaigns/fixed-id/widget?theme=light",
    );
    invalid.remove();
  });
});
