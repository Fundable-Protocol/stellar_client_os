import { describe, expect, it, vi } from "vitest";
import {
  generateQRCodeSVG,
  generateQRCodePNGDataURL,
  downloadQRCodeSVG,
  downloadQRCodePNG,
  QR_CODE_SIZE_OPTIONS,
} from "./campaign-qr-code.service";

describe("campaign-qr-code.service", () => {
  const testUrl = "https://fundable.example/campaigns/test-campaign-123";

  it("provides predefined size options for flyers, business cards, banners", () => {
    expect(QR_CODE_SIZE_OPTIONS).toHaveLength(4);
    const sizes = QR_CODE_SIZE_OPTIONS.map((o) => o.size);
    expect(sizes).toEqual([256, 512, 1024, 2048]);
  });

  it("generates an SVG string encoding the canonical URL", async () => {
    const svg = await generateQRCodeSVG(testUrl, 512);
    expect(svg).toBeTypeOf("string");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("generates a PNG Data URL encoding the canonical URL", async () => {
    const pngDataUrl = await generateQRCodePNGDataURL(testUrl, 256);
    expect(pngDataUrl).toBeTypeOf("string");
    expect(pngDataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("downloads SVG properly creating an anchor element", async () => {
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");

    await downloadQRCodeSVG(testUrl, "campaign-qr", 512);

    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it("downloads PNG properly creating an anchor element", async () => {
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    const removeChildSpy = vi.spyOn(document.body, "removeChild");

    await downloadQRCodePNG(testUrl, "campaign-qr", 1024);

    expect(appendChildSpy).toHaveBeenCalled();
    expect(removeChildSpy).toHaveBeenCalled();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});
