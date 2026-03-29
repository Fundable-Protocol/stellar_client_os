"use client";

import { useMemo } from "react";
import AppSelect from "@/components/molecules/AppSelect";
import InputWithLabel from "@/components/molecules/InputWithLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Lock, AlertCircle, Calendar } from "lucide-react";
import {
  validateEndTime,
  calculateEndTime,
  formatEndTime,
  getRelativeTime,
  type DurationUnit,
} from "@/lib/stream-validation";

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

interface StreamFormProps {
  streamData: StreamFormData;
  tokenOptions: { label: string; value: string }[];
  setStreamData: React.Dispatch<React.SetStateAction<StreamFormData>>;
  durationOptions: { label: string; value: string }[];
  onSubmit: () => void;
  isSubmitting: boolean;
  balanceError?: string | null;
  insufficientBalance?: boolean;
}

export function PaymentStreamForm({
  streamData,
  tokenOptions,
  setStreamData,
  durationOptions,
  onSubmit,
  isSubmitting,
  balanceError,
  insufficientBalance,
}: StreamFormProps) {
  const booleanOptions = [
    { label: "Yes", value: "true" },
    { label: "No", value: "false" },
  ];

  const handleStreamDataChange = (
    key: keyof StreamFormData,
    value: string | boolean
  ) => {
    setStreamData((prev) => ({ ...prev, [key]: value }));
  };

  // Validate end time
  const endTimeValidation = useMemo(() => {
    if (!streamData.durationValue || !streamData.duration) {
      return { isValid: true, error: null, endTime: null, relativeTime: null };
    }

    const error = validateEndTime(null, streamData.durationValue, streamData.duration);
    
    if (error) {
      return { isValid: false, error, endTime: null, relativeTime: null };
    }

    const duration = parseInt(streamData.durationValue);
    const endTime = calculateEndTime(null, duration, streamData.duration as DurationUnit);
    const relativeTime = getRelativeTime(endTime);

    return { isValid: true, error: null, endTime, relativeTime };
  }, [streamData.durationValue, streamData.duration]);

  const isFormValid =
    !isSubmitting &&
    !insufficientBalance &&
    streamData.name &&
    streamData.durationValue &&
    streamData.recipient &&
    streamData.amount &&
    endTimeValidation.isValid;

  return (
    <div className="w-full h-full flex flex-col">
      <div>
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 my-6">
          <InputWithLabel
            title="Stream Name"
            name="name"
            placeholder="e.g., Monthly Salary"
            value={streamData.name}
            onChange={(e) => handleStreamDataChange("name", e.target.value)}
          />
          <InputWithLabel
            title="Total Amount"
            name="amount"
            type="number"
            step="0.0000001"
            placeholder="Enter total amount to stream"
            value={streamData.amount}
            onChange={(e) => handleStreamDataChange("amount", e.target.value)}
            errorMessage={balanceError ?? undefined}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 my-6">
          <AppSelect
            className="h-12"
            titleClassName="text-zinc-300"
            setValue={(value) => handleStreamDataChange("token", value)}
            options={tokenOptions}
            title="Token"
            placeholder={streamData.token}
          />
          <AppSelect
            className="h-12"
            titleClassName="text-zinc-300"
            setValue={(value) =>
              handleStreamDataChange("transferability", value === "true")
            }
            options={booleanOptions}
            title="Make the stream transferable?"
            placeholder={streamData.transferability ? "Yes" : "No"}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 my-6">
          <AppSelect
            className="h-12"
            titleClassName="text-zinc-300"
            setValue={(value) =>
              handleStreamDataChange("cancellability", value === "true")
            }
            options={booleanOptions}
            title="Make the stream cancellable?"
            placeholder={streamData.cancellability ? "Yes" : "No"}
          />
          <InputWithLabel
            title="Recipient Address"
            name="recipient"
            placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            value={streamData.recipient}
            onChange={(e) =>
              handleStreamDataChange("recipient", e.target.value)
            }
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 my-6 justify-between">
          <div className="flex flex-col">
            <h3 className="text-zinc-300 mb-3 sm:text-nowrap">
              Streaming Duration
            </h3>
            <div className="w-full grid grid-cols-1 sm:grid-cols-[0.5fr_1.5fr] items-end gap-3 sm:gap-x-6">
              <Input
                className={`border-zinc-700 bg-zinc-800 rounded h-12 placeholder:text-zinc-500 text-white ${
                  endTimeValidation.error ? "border-red-500" : ""
                }`}
                maxLength={streamData.duration === "hour" ? 1 : 3}
                placeholder="Value eg. 1"
                value={streamData.durationValue}
                onChange={(e) =>
                  handleStreamDataChange("durationValue", e.target.value)
                }
              />
              <AppSelect
                className="h-12"
                setValue={(value) => handleStreamDataChange("duration", value)}
                options={durationOptions}
                placeholder={streamData.duration || "Pick a duration"}
              />
            </div>

            {/* End Time Validation Error */}
            {endTimeValidation.error && (
              <div className="mt-2 flex items-start gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{endTimeValidation.error}</span>
              </div>
            )}

            {/* End Time Preview */}
            {endTimeValidation.isValid && endTimeValidation.endTime && (
              <div className="mt-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                <div className="flex items-start gap-2 text-zinc-300 text-sm">
                  <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0 text-purple-400" />
                  <div>
                    <p className="font-medium text-zinc-200 mb-1">Stream will end:</p>
                    <p className="text-zinc-400 text-xs">
                      {formatEndTime(endTimeValidation.endTime)}
                    </p>
                    <p className="text-purple-400 text-xs mt-1">
                      {endTimeValidation.relativeTime}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Button
            size="lg"
            className="justify-self-stretch self-stretch sm:justify-self-end sm:self-end h-12 min-h-[44px] w-full sm:w-fit bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!isFormValid}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Proceed</span>
                <Lock className="w-[0.7rem] h-[0.91rem] font-bold" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PaymentStreamForm;
