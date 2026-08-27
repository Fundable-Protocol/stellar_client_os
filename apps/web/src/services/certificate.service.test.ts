// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateCertificateInput,
  generateQrDataUri,
  generateCertificate,
  CertificateError,
  type CertificateInput,
} from "./certificate.service";

// ── Mock heavy dependencies ───────────────────────────────────────────────────

vi.mock("pdf-lib", () => ({
  PDFDocument: {
    create: vi.fn().mockResolvedValue({
      setTitle: vi.fn(),
      setAuthor: vi.fn(),
      setSubject: vi.fn(),
      setCreationDate: vi.fn(),
      addPage: vi.fn().mockReturnValue({
        drawRectangle: vi.fn(),
        drawText: vi.fn(),
        drawLine: vi.fn(),
        drawImage: vi.fn(),
      }),
      embedFont: vi.fn().mockResolvedValue({
        widthOfTextAtSize: vi.fn().mockReturnValue(80),
      }),
      embedPng: vi.fn().mockResolvedValue({}),
      save: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])), // %PDF
    }),
  },
  rgb: vi.fn().mockReturnValue({ r: 0, g: 0, b: 0 }),
  StandardFonts: {
    Helvetica: "Helvetica",
    HelveticaBold: "Helvetica-Bold",
    HelveticaOblique: "Helvetica-Oblique",
  },
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    ),
  },
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const validInput: CertificateInput = {
  donorName: "Alice Dupont",
  donorAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  recipientName: "Green Planet Fund",
  transactionHash:
    "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  network: "testnet",
  lineItems: [
    {
      description: "Stream #42",
      token: "USDC",
      amount: "1,000.00",
      timestamp: 1700000000,
    },
    {
      description: "Direct Donation",
      token: "XLM",
      amount: "500.00",
      timestamp: 1700001000,
    },
  ],
  totalAmount: "1,500.00 USDC",
  issuedAt: "2025-01-15",
};

// ── validateCertificateInput ──────────────────────────────────────────────────

describe("validateCertificateInput", () => {
  it("passes for a fully valid input", () => {
    expect(() => validateCertificateInput(validInput)).not.toThrow();
  });

  it("throws INVALID_INPUT when donorName is missing", () => {
    const input = { ...validInput, donorName: "" };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
    try {
      validateCertificateInput(input);
    } catch (e) {
      expect((e as CertificateError).code).toBe("INVALID_INPUT");
    }
  });

  it("throws INVALID_INPUT when donorAddress is missing", () => {
    const input = { ...validInput, donorAddress: "   " };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
  });

  it("throws INVALID_INPUT when transactionHash is missing", () => {
    const input = { ...validInput, transactionHash: "" };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
  });

  it("throws INVALID_INPUT when totalAmount is missing", () => {
    const input = { ...validInput, totalAmount: "" };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
  });

  it("throws INVALID_INPUT when lineItems is empty", () => {
    const input = { ...validInput, lineItems: [] };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
  });

  it("throws INVALID_INPUT when a line item is missing description", () => {
    const input = {
      ...validInput,
      lineItems: [{ ...validInput.lineItems[0], description: "" }],
    };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
  });

  it("throws INVALID_INPUT when a line item is missing token", () => {
    const input = {
      ...validInput,
      lineItems: [{ ...validInput.lineItems[0], token: "" }],
    };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
  });

  it("throws INVALID_INPUT when a line item is missing amount", () => {
    const input = {
      ...validInput,
      lineItems: [{ ...validInput.lineItems[0], amount: "" }],
    };
    expect(() => validateCertificateInput(input)).toThrowError(CertificateError);
  });
});

// ── generateQrDataUri ─────────────────────────────────────────────────────────

describe("generateQrDataUri", () => {
  it("returns a data URI string for a valid URL", async () => {
    const result = await generateQrDataUri("https://stellar.expert/explorer/testnet/tx/abc");
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it("returns null when QRCode.toDataURL throws", async () => {
    const QRCode = await import("qrcode");
    vi.mocked(QRCode.default.toDataURL).mockRejectedValueOnce(new Error("QR fail"));
    const result = await generateQrDataUri("https://example.com");
    expect(result).toBeNull();
  });
});

// ── generateCertificate ───────────────────────────────────────────────────────

describe("generateCertificate", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Restore default mock after each test
    const QRCode = await import("qrcode");
    vi.mocked(QRCode.default.toDataURL).mockResolvedValue(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    );
  });

  it("returns pdfBytes, certificateId, and generatedAt", async () => {
    const result = await generateCertificate(validInput);
    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
    expect(result.pdfBytes.length).toBeGreaterThan(0);
    expect(result.certificateId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("generates unique certificate IDs on successive calls", async () => {
    const r1 = await generateCertificate(validInput);
    const r2 = await generateCertificate(validInput);
    expect(r1.certificateId).not.toBe(r2.certificateId);
  });

  it("works for invoice documentType", async () => {
    const invoiceInput: CertificateInput = {
      ...validInput,
      documentType: "invoice",
    };
    const result = await generateCertificate(invoiceInput);
    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
  });

  it("works for mainnet network", async () => {
    const mainnetInput: CertificateInput = {
      ...validInput,
      network: "mainnet",
    };
    const result = await generateCertificate(mainnetInput);
    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
  });

  it("handles missing optional issuedAt gracefully", async () => {
    const { issuedAt, ...rest } = validInput;
    void issuedAt;
    const result = await generateCertificate(rest as CertificateInput);
    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
  });

  it("throws CertificateError with INVALID_INPUT for bad input", async () => {
    await expect(
      generateCertificate({ ...validInput, donorName: "" })
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("wraps pdf-lib errors as PDF_GENERATION_FAILED", async () => {
    const { PDFDocument } = await import("pdf-lib");
    vi.mocked(PDFDocument.create).mockRejectedValueOnce(new Error("out of memory"));
    await expect(generateCertificate(validInput)).rejects.toMatchObject({
      code: "PDF_GENERATION_FAILED",
    });
  });

  it("produces non-empty PDF bytes even when QR generation fails", async () => {
    const QRCode = await import("qrcode");
    vi.mocked(QRCode.default.toDataURL).mockResolvedValueOnce(null as unknown as string);
    const result = await generateCertificate(validInput);
    expect(result.pdfBytes.length).toBeGreaterThan(0);
  });

  it("handles multiple line items without throwing", async () => {
    const manyItems: CertificateInput = {
      ...validInput,
      lineItems: Array.from({ length: 20 }, (_, i) => ({
        description: `Stream #${i + 1}`,
        token: "USDC",
        amount: `${(i + 1) * 100}.00`,
        timestamp: 1700000000 + i * 3600,
      })),
      totalAmount: "21,000.00 USDC",
    };
    const result = await generateCertificate(manyItems);
    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
  });
});

// ── CertificateError ──────────────────────────────────────────────────────────

describe("CertificateError", () => {
  it("is an instance of Error", () => {
    const e = new CertificateError("test", "INVALID_INPUT");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(CertificateError);
  });

  it("preserves the error code", () => {
    const codes = ["INVALID_INPUT", "QR_GENERATION_FAILED", "PDF_GENERATION_FAILED"] as const;
    codes.forEach((code) => {
      const e = new CertificateError("msg", code);
      expect(e.code).toBe(code);
    });
  });

  it("has the correct name", () => {
    const e = new CertificateError("msg", "INVALID_INPUT");
    expect(e.name).toBe("CertificateError");
  });
});
