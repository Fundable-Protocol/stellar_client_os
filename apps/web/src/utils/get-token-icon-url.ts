import { STELLAR_NETWORK } from "@/lib/constants";

/**
 * Constructs a token icon URL from Stellar Expert or local assets
 *
 * @param assetCode - The asset code (e.g., "XLM", "USDC")
 * @param assetIssuer - The issuer's public key (optional, undefined for native XLM)
 * @returns The full URL to the token icon
 *
 * @example
 * // Native XLM - uses local logo
 * getTokenIconUrl("XLM")
 * // => "/stellar-xlm-logo.svg"
 *
 * @example
 * // Custom token - uses Stellar Expert
 * getTokenIconUrl("USDC", "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN")
 * // => "https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
 */
export function getTokenIconUrl(
  assetCode: string,
  assetIssuer?: string,
): string {
  // Handle native XLM - use local logo
  if (assetCode === "XLM" && !assetIssuer) {
    return "/stellar-xlm-logo.svg";
  }

  const network = STELLAR_NETWORK === "mainnet" ? "public" : "testnet";

  // Handle custom tokens with issuer - use Stellar Expert
  const baseUrl = `https://stellar.expert/explorer/${network}/asset`;

  if (!assetIssuer) {
    return `${baseUrl}/${assetCode}`;
  }

  return `${baseUrl}/${assetCode}-${assetIssuer}`;
}
