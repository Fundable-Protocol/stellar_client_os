"use client";

import { SUPPORTED_TOKENS, PaymentStreamFormData } from "@/lib/validations";

interface StreamFormData {
  name: string;
  recipient: string;
  token: string;
  amount: string;
  duration: string;
  durationValue: string;
  cancellability: boolean;
  transferability: boolean;
}

interface PaymentStreamSummaryProps {
  streamData?: StreamFormData;
  data?: PaymentStreamFormData; // To support old PaymentStreamFormData pattern in ConfirmationModal
  showTitle?: boolean;
  estimatedFee?: string | null;
  isEstimatingFee?: boolean;
}

export function PaymentStreamSummary({ 
  streamData, 
  data, 
  showTitle = true,
  estimatedFee,
  isEstimatingFee = false
}: PaymentStreamSummaryProps) {
  // Normalize data
  const name = streamData?.name || "";
  const recipient = streamData?.recipient || data?.recipientAddress || "";
  const token = streamData?.token || data?.token || "";
  const amount = streamData?.amount || data?.totalAmount || "";
  const durationValue = streamData?.durationValue || data?.duration || "";
  const durationUnit = streamData?.duration || (data?.durationUnit === "hours" ? "hour" : "day") || "";
  const cancellable = streamData?.cancellability ?? data?.cancelable ?? true;
  const transferable = streamData?.transferability ?? data?.transferable ?? false;

  const selectedToken = SUPPORTED_TOKENS.find(
    (t) => t.value === token
  );

  // Parse and validate duration to avoid division by zero
  const parsedDuration = parseFloat(durationValue);

  // Calculate duration in hours based on the duration type
  let durationInHours = 1;
  if (Number.isFinite(parsedDuration) && parsedDuration > 0) {
    switch (durationUnit) {
      case "hour":
        durationInHours = parsedDuration;
        break;
      case "day":
        durationInHours = parsedDuration * 24;
        break;
      case "week":
        durationInHours = parsedDuration * 24 * 7;
        break;
      case "month":
        durationInHours = parsedDuration * 24 * 30;
        break;
      case "year":
        durationInHours = parsedDuration * 24 * 365;
        break;
      default:
        durationInHours = parsedDuration * 24;
    }
  }

  // Parse and validate amount to avoid NaN propagation
  const totalAmount = parseFloat(amount);
  const validAmount = Number.isFinite(totalAmount) ? totalAmount : 0;

  const amountPerHour = validAmount / durationInHours;
  const amountPerDay = amountPerHour * 24;

  return (
    <div className="space-y-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 h-fit">
      {showTitle && (
        <h3 className="font-semibold text-lg text-zinc-50">Stream Summary</h3>
      )}

      <div className="space-y-3 text-sm">
        {name && (
          <div>
            <span className="text-zinc-400">Name:</span>
            <p className="font-medium text-zinc-50">{name}</p>
          </div>
        )}

        {recipient && (
          <div>
            <span className="text-zinc-400">Recipient:</span>
            <p className="font-mono text-xs break-all text-zinc-50">
              {recipient}
            </p>
          </div>
        )}

        <div>
          <span className="text-zinc-400">Token:</span>
          <p className="font-medium text-zinc-50">
            {selectedToken?.label || token}
          </p>
        </div>

        {amount && (
          <div>
            <span className="text-zinc-400">Total Amount:</span>
            <p className="font-medium text-zinc-50">
              {amount} {token}
            </p>
          </div>
        )}

        {durationValue && (
          <div>
            <span className="text-zinc-400">Duration:</span>
            <p className="font-medium text-zinc-50">
              {durationValue} {durationUnit}(s)
            </p>
          </div>
        )}

        {validAmount > 0 && (
          <>
            <div>
              <span className="text-zinc-400">Rate per Hour:</span>
              <p className="font-medium text-zinc-50">
                {amountPerHour.toFixed(4)} {token}
              </p>
            </div>

            <div>
              <span className="text-zinc-400">Rate per Day:</span>
              <p className="font-medium text-zinc-50">
                {amountPerDay.toFixed(4)} {token}
              </p>
            </div>
          </>
        )}

        {/* Estimated Fee Section */}
        <div className="pt-2 border-t border-zinc-700/50">
          <span className="text-zinc-400 block mb-1">Estimated Network Fee:</span>
          <div className="flex items-center">
            {isEstimatingFee ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded-full border-2 border-zinc-500 border-t-zinc-200 animate-spin" />
                <span className="text-zinc-400 text-sm">Estimating...</span>
              </div>
            ) : (
              <p className="font-medium text-zinc-50">
                {estimatedFee || "~0.0001 XLM"}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-sm pt-2 border-t border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Cancelable:</span>
          <span
            className={`px-2 py-1 rounded text-xs ${cancellable
                ? "bg-green-900/30 text-green-400 border border-green-800"
                : "bg-red-900/30 text-red-400 border border-red-800"
              }`}
          >
            {cancellable ? "Yes" : "No"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Transferable:</span>
          <span
            className={`px-2 py-1 rounded text-xs ${transferable
                ? "bg-green-900/30 text-green-400 border border-green-800"
                : "bg-red-900/30 text-red-400 border border-red-800"
              }`}
          >
            {transferable ? "Yes" : "No"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PaymentStreamSummary;
