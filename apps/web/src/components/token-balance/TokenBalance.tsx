"use client";

import { useState } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { TokenBalanceProps } from "@/types/token-balance.types";
import { formatBalance } from "@/utils/format-balance";

/**
 * TokenBalance Component
 *
 * A presentational component that displays a single token's balance information.
 * Shows the token icon, asset code, and formatted balance amount.
 *
 * Icon Fallback Handling:
 * - If iconUrl is not provided, displays fallback placeholder
 * - If icon fails to load, automatically switches to fallback placeholder
 * - Fallback shows the first letter of the asset code in a styled circle
 *
 * Requirements:
 * - 2.1: Display asset code
 * - 2.2: Display formatted balance with appropriate decimal precision
 * - 2.3: Display token icon where available
 * - 2.5: Apply Tailwind CSS with Fundable theme
 * - 5.3: Display fallback placeholder icon on error
 * - 8.1: React functional component compatible with React 19
 *
 * @param props - Component props
 * @param props.assetCode - The token's asset code (e.g., "XLM", "USDC")
 * @param props.assetIssuer - The public key of the token issuer (optional, undefined for native XLM)
 * @param props.balance - The raw balance amount as a string (will be formatted for display)
 * @param props.iconUrl - The URL to the token icon (optional, falls back to placeholder if not provided or fails to load)
 *
 * @example
 * // Display native XLM balance
 * ```tsx
 * <TokenBalance
 *   assetCode="XLM"
 *   balance="1234.5678901"
 *   iconUrl="https://stellar.expert/explorer/public/asset/XLM"
 * />
 * ```
 *
 * @example
 * // Display custom token balance with issuer
 * ```tsx
 * <TokenBalance
 *   assetCode="USDC"
 *   assetIssuer="GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
 *   balance="500.00"
 *   iconUrl="https://stellar.expert/explorer/public/asset/USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
 * />
 * ```
 *
 * @example
 * // Display token without icon URL (will show fallback)
 * ```tsx
 * <TokenBalance
 *   assetCode="MYTOKEN"
 *   assetIssuer="GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
 *   balance="100.50"
 * />
 * ```
 */
export function TokenBalance({
  assetCode,
  assetIssuer,
  balance,
  iconUrl,
}: TokenBalanceProps) {
  const [imageError, setImageError] = useState(false);
  const [imageTimedOut, setImageTimedOut] = useState(false);
  const formattedBalance = formatBalance(balance);

  // Handle image timeout for slow connections (3G)
  // Resets when iconUrl changes (key prop on parent resets state)
  useEffect(() => {
    if (!iconUrl) return;

    const timeoutId = setTimeout(() => {
      setImageTimedOut(true);
      setImageError(true);
    }, 15000); // 15 second timeout for slow 3G connections

    return () => clearTimeout(timeoutId);
  }, [iconUrl]);

  const handleRetry = () => {
    setImageError(false);
    setImageTimedOut(false);
  };

  // Use key to reset state when iconUrl or assetCode changes
  // This replaces the useEffect-based reset that violated react-hooks/set-state-in-effect
  const resetKey = `${iconUrl ?? ""}-${assetCode}`;

  const formattedBalance = formatBalance(balance);

  return (
    <div key={resetKey} className="flex items-center gap-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors">
      {/* Token Icon */}
      <div className="shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden p-1.5 relative">
        {iconUrl && !imageError ? (
          <Image
            src={iconUrl}
            alt={`${assetCode} icon`}
            width={40}
            height={40}
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
            unoptimized // Required for external images without domain configuration
          />
        ) : (
          // Fallback icon - displays first letter of asset code
          <span className="text-lg font-bold text-violet-400">
            {assetCode.charAt(0)}
          </span>
        )}
        {/* Retry button on timeout/error */}
        {imageTimedOut && (
          <button
            onClick={handleRetry}
            className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full hover:bg-black/70 transition-colors"
            title="Retry loading image"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        )}
      <div
        key={`${iconUrl ?? "no-icon"}-${assetCode}`}
        className="shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden p-1.5"
      >
        <TokenIcon assetCode={assetCode} iconUrl={iconUrl} />
      </div>

      {/* Token Information */}
      <div className="flex-1 min-w-0">
        {/* Asset Code */}
        <div className="font-semibold text-zinc-50 text-base">{assetCode}</div>

        {/* Asset Issuer (truncated for custom tokens) */}
        {assetIssuer && (
          <div className="text-xs text-zinc-400 font-mono truncate">
            {assetIssuer.substring(0, 8)}...
            {assetIssuer.substring(assetIssuer.length - 4)}
          </div>
        )}
      </div>

      {/* Balance Amount */}
      <div className="shrink-0 text-right">
        <div className="font-semibold text-lg text-violet-400">
          {formattedBalance}
        </div>
        <div className="text-xs text-zinc-400">{assetCode}</div>
      </div>
    </div>
  );
}

function TokenIcon({
  assetCode,
  iconUrl,
}: {
  assetCode: string;
  iconUrl?: string;
}) {
  const [imageError, setImageError] = useState(false);

  if (iconUrl && !imageError) {
    return (
      <Image
        src={iconUrl}
        alt={`${assetCode} icon`}
        width={40}
        height={40}
        className="w-full h-full object-contain"
        onError={() => setImageError(true)}
        unoptimized // Required for external images without domain configuration
      />
    );
  }

  return (
    // Fallback icon - displays first letter of asset code
    <span className="text-lg font-bold text-violet-400">
      {assetCode.charAt(0)}
    </span>
  );
}
