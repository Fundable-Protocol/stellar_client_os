import toast from "react-hot-toast";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

const DEFAULT_DURATION_MS = 5000;
const MIN_DURATION_MS = 2000;
const MAX_DURATION_MS = 10000;

function clampDuration(ms?: number) {
  if (typeof ms !== "number" || Number.isNaN(ms)) return DEFAULT_DURATION_MS;
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(ms)));
}

const IS_MAINNET = process.env.NEXT_PUBLIC_STELLAR_NETWORK === "public";
const EXPLORER_URL = IS_MAINNET
  ? "https://stellar.expert/explorer/public/tx/"
  : "https://stellar.expert/explorer/testnet/tx/";

export const notify = {
  loading: (message: string = "Processing transaction...", durationMs?: number) =>
    toast.loading(message, { id: "tx-toast", duration: clampDuration(durationMs) }),

  success: (txHash: string, message: string = "Transaction Successful", durationMs?: number) => {
    toast.dismiss("tx-toast");
    toast.success(
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{message}</span>
        <a
          href={`${EXPLORER_URL}${encodeURIComponent(txHash)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          View on Explorer
          <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </a>
      </div>,
      { duration: clampDuration(durationMs) }
    );
  },

  // 3. Error (With Retry Option)
  error: (message: ReactNode, onRetry?: () => void, durationMs?: number) => {
    toast.dismiss("tx-toast");
    toast.error(
      <div className="flex flex-col gap-2">
        <div className="font-medium">{message}</div>
        {onRetry && (
          <button
            onClick={() => {
              toast.dismiss();
              onRetry();
            }}
            className="flex items-center gap-2 w-fit bg-violet-900/50 hover:bg-violet-900 text-xs px-3 py-1.5 rounded-md transition-colors border border-violet-700"
          >
            <RefreshCw className="w-3 h-3" />
            Retry Transaction
          </button>
        )}
      </div>,
      { duration: clampDuration(durationMs) }
    );
  },
};
