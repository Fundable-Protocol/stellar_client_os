import QRCode from "qrcode";

export type QRCodeSize = 256 | 512 | 1024 | 2048;

export interface QRCodeSizeOption {
  size: QRCodeSize;
  label: string;
  description: string;
}

export const QR_CODE_SIZE_OPTIONS: QRCodeSizeOption[] = [
  { size: 256, label: "Small (256px)", description: "Best for business cards & badges" },
  { size: 512, label: "Medium (512px)", description: "Best for flyers & handouts" },
  { size: 1024, label: "Large (1024px)", description: "Best for posters & table stands" },
  { size: 2048, label: "Extra Large (2048px)", description: "Best for event banners & signage" },
];

export interface GenerateQRCodeOptions {
  margin?: number;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

/**
 * Generate a standalone SVG string of the QR code for a given text or URL.
 */
export async function generateQRCodeSVG(
  text: string,
  size: number = 512,
  options: GenerateQRCodeOptions = {}
): Promise<string> {
  const { margin = 2, errorCorrectionLevel = "M" } = options;
  return QRCode.toString(text, {
    type: "svg",
    width: size,
    margin,
    errorCorrectionLevel,
  });
}

/**
 * Generate a PNG data URL of the QR code for a given text or URL.
 */
export async function generateQRCodePNGDataURL(
  text: string,
  size: number = 512,
  options: GenerateQRCodeOptions = {}
): Promise<string> {
  const { margin = 2, errorCorrectionLevel = "M" } = options;
  return QRCode.toDataURL(text, {
    type: "image/png",
    width: size,
    margin,
    errorCorrectionLevel,
  });
}

/**
 * Trigger a browser download of an SVG QR code file.
 */
export async function downloadQRCodeSVG(
  text: string,
  filename: string,
  size: number = 512,
  options?: GenerateQRCodeOptions
): Promise<void> {
  const svgString = await generateQRCodeSVG(text, size, options);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Trigger a browser download of a PNG QR code file.
 */
export async function downloadQRCodePNG(
  text: string,
  filename: string,
  size: number = 512,
  options?: GenerateQRCodeOptions
): Promise<void> {
  const dataUrl = await generateQRCodePNGDataURL(text, size, options);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
