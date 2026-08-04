"use client";

import { useMemo } from "react";
import { AlertCircle, Calendar, Info } from "lucide-react";
import AppSelect from "@/components/molecules/AppSelect";
import InputWithLabel from "@/components/molecules/InputWithLabel";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { sliceAddress } from "@/lib/utils";
import {
  calculateEndTime,
  formatEndTime,
  getRelativeTime,
  type DurationUnit,
} from "@/lib/stream-validation";
import {
  DURATION_UNIT_OPTIONS,
  type WizardErrors,
  type WizardStreamData,
} from "./wizard-config";

interface StepProps {
  data: WizardStreamData;
  errors: WizardErrors;
  updateField: <K extends keyof WizardStreamData>(
    key: K,
    value: WizardStreamData[K]
  ) => void;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-2 flex items-start gap-2 text-sm text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

export function CampaignDetailsStep({ data, errors, updateField }: StepProps) {
  return (
    <div className="flex flex-col gap-6">
      <InputWithLabel
        title="Campaign Name"
        name="campaignName"
        placeholder="e.g., Q3 Contributor Grants"
        value={data.campaignName}
        onChange={(e) => updateField("campaignName", e.target.value)}
        errorMessage={errors.campaignName}
      />

      <div className="flex w-full flex-col">
        <label
          htmlFor="campaign-description"
          className="mb-3 text-zinc-300 sm:text-nowrap"
        >
          Campaign Description
        </label>
        <textarea
          id="campaign-description"
          name="campaignDescription"
          rows={4}
          placeholder="What is this funding stream for?"
          value={data.campaignDescription}
          aria-invalid={!!errors.campaignDescription}
          onChange={(e) => updateField("campaignDescription", e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-800 p-3 text-white placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <FieldError message={errors.campaignDescription} />
      </div>
    </div>
  );
}

interface FundingStepProps extends StepProps {
  tokenOptions: { label: string; value: string }[];
}

export function FundingStep({
  data,
  errors,
  updateField,
  tokenOptions,
}: FundingStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <AppSelect
          className="h-12"
          titleClassName="text-zinc-300"
          title="Token"
          options={tokenOptions}
          value={data.token}
          setValue={(value) => updateField("token", value)}
          placeholder={data.token || "Select a token"}
        />
        <InputWithLabel
          title="Total Amount"
          name="amount"
          type="number"
          step="0.0000001"
          min="0"
          placeholder="Enter total amount to stream"
          value={data.amount}
          onChange={(e) => updateField("amount", e.target.value)}
          errorMessage={errors.amount}
        />
      </div>

      <InputWithLabel
        title="Recipient Address"
        name="recipient"
        placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
        value={data.recipient}
        onChange={(e) => updateField("recipient", e.target.value)}
        errorMessage={errors.recipient}
      />

      <FieldError message={errors.token} />
    </div>
  );
}

export function ScheduleStep({ data, errors, updateField }: StepProps) {
  const endTimePreview = useMemo(() => {
    const durationValue = Number(data.duration);
    if (!Number.isFinite(durationValue) || durationValue <= 0 || errors.duration) {
      return null;
    }

    const endTime = calculateEndTime(
      null,
      durationValue,
      data.durationUnit as DurationUnit
    );

    return { endTime, relativeTime: getRelativeTime(endTime) };
  }, [data.duration, data.durationUnit, errors.duration]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <h3 className="mb-3 text-zinc-300">Streaming Duration</h3>
        <div className="grid w-full grid-cols-1 items-end gap-3 sm:grid-cols-[0.5fr_1.5fr] sm:gap-x-6">
          <Input
            aria-label="Duration value"
            type="number"
            min="1"
            placeholder="Value e.g. 30"
            value={data.duration}
            aria-invalid={!!errors.duration}
            onChange={(e) => updateField("duration", e.target.value)}
            className={`h-12 rounded border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 ${
              errors.duration ? "border-red-500" : ""
            }`}
          />
          <AppSelect
            className="h-12"
            options={DURATION_UNIT_OPTIONS}
            value={data.durationUnit}
            setValue={(value) => updateField("durationUnit", value)}
            placeholder={data.durationUnit || "Pick a duration"}
          />
        </div>
        <FieldError message={errors.duration} />

        {endTimePreview && (
          <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
            <div className="flex items-start gap-2 text-sm text-zinc-300">
              <Calendar
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-purple-400"
                aria-hidden="true"
              />
              <div>
                <p className="mb-1 font-medium text-zinc-200">Stream will end:</p>
                <p className="text-xs text-zinc-400">
                  {formatEndTime(endTimePreview.endTime)}
                </p>
                <p className="mt-1 text-xs text-purple-400">
                  {endTimePreview.relativeTime}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <ToggleRow
          label="Cancellable stream"
          hint="You can stop the stream and reclaim unvested funds."
          checked={data.cancellability}
          onCheckedChange={(checked) => updateField("cancellability", checked)}
        />
        <ToggleRow
          label="Transferable stream"
          hint="The recipient can transfer their claim to another address."
          checked={data.transferability}
          onCheckedChange={(checked) => updateField("transferability", checked)}
        />
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function ToggleRow({ label, hint, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-200">{label}</span>
        <span className="text-xs text-zinc-500">{hint}</span>
      </span>
      <Switch
        aria-label={label}
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
    </div>
  );
}

interface ReviewStepProps {
  data: WizardStreamData;
  estimatedFee?: string | null;
  isEstimatingFee?: boolean;
}

export function ReviewStep({
  data,
  estimatedFee,
  isEstimatingFee,
}: ReviewStepProps) {
  const rows: { label: string; value: string }[] = [
    { label: "Campaign", value: data.campaignName },
    { label: "Recipient", value: sliceAddress(data.recipient) },
    { label: "Token", value: data.token },
    { label: "Total amount", value: `${data.amount} ${data.token}` },
    {
      label: "Duration",
      value: `${data.duration} ${data.durationUnit}${
        Number(data.duration) === 1 ? "" : "s"
      }`,
    },
    { label: "Cancellable", value: data.cancellability ? "Yes" : "No" },
    { label: "Transferable", value: data.transferability ? "Yes" : "No" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-zinc-800 rounded-lg border border-zinc-700 bg-zinc-800/40">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <dt className="text-sm text-zinc-400">{row.label}</dt>
            <dd className="break-all text-sm font-medium text-zinc-100">
              {row.value}
            </dd>
          </div>
        ))}
        <div className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <dt className="text-sm text-zinc-400">Estimated network fee</dt>
          <dd className="text-sm font-medium text-zinc-100">
            {isEstimatingFee ? "Estimating…" : estimatedFee ?? "—"}
          </dd>
        </div>
      </dl>

      {data.campaignDescription && (
        <p className="rounded-lg border border-zinc-700 bg-zinc-800/40 px-4 py-3 text-sm text-zinc-400">
          {data.campaignDescription}
        </p>
      )}

      <p className="flex items-start gap-2 text-xs text-zinc-500">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span>
          Funds are locked in the stream contract and released to the recipient
          continuously over the duration you chose.
        </span>
      </p>
    </div>
  );
}
