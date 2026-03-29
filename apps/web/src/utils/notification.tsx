import toast from "react-hot-toast";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { STELLAR_NETWORK } from "@/lib/constants";

const EXPLORER_URL = STELLAR_NETWORK === "mainnet"
  ? "https://stellar.expert/explorer/public/tx/"
  : "https://stellar.expert/explorer/testnet/tx/";

export const notify = {
  loading: (message: string = "Processing transaction...") =>
    toast.loading(message, { id: "tx-toast" }),

  success: (txHash: string, message: string = "Transaction Successful") => {
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
    );
  },

  // 3. Error (With Retry Option)
  error: (message: ReactNode, onRetry?: () => void) => {
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
    );
  },
};
