"use client";

import React, { useState } from "react";
import { Plus, Trash2, Calendar, Target, Sparkles, Layers, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CampaignWizardData,
  WizardStepErrors,
  CATEGORY_OPTIONS,
  TOKEN_OPTIONS,
  MilestoneItem,
} from "./campaign-wizard-config";

interface StepProps {
  data: CampaignWizardData;
  errors: WizardStepErrors;
  updateField: <K extends keyof CampaignWizardData>(field: K, value: CampaignWizardData[K]) => void;
}

// Step 1: Details Component
export function DetailsStep({ data, errors, updateField }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <Layers className="h-5 w-5 text-purple-400" />
          Step 1: Campaign Details
        </h3>
        <p className="text-sm text-zinc-400">Basic details about your project name, category, and main description.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="title" className="text-zinc-200">
            Campaign Title <span className="text-rose-400">*</span>
          </Label>
          <Input
            id="title"
            placeholder="e.g. Save the Amazon RainForest Reserve"
            value={data.title}
            onChange={(e) => updateField("title", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500"
          />
          {errors.title && <p className="mt-1 text-xs text-rose-400">{errors.title}</p>}
        </div>

        <div>
          <Label htmlFor="category" className="text-zinc-200">
            Category <span className="text-rose-400">*</span>
          </Label>
          <select
            id="category"
            value={data.category}
            onChange={(e) => updateField("category", e.target.value)}
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-purple-500 focus:outline-none"
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
          {errors.category && <p className="mt-1 text-xs text-rose-400">{errors.category}</p>}
        </div>

        <div>
          <Label htmlFor="shortDescription" className="text-zinc-200">
            Short Tagline / Summary <span className="text-rose-400">*</span>
          </Label>
          <Input
            id="shortDescription"
            placeholder="A single sentence capturing the core mission of your campaign..."
            value={data.shortDescription}
            onChange={(e) => updateField("shortDescription", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
          />
          {errors.shortDescription && <p className="mt-1 text-xs text-rose-400">{errors.shortDescription}</p>}
        </div>

        <div>
          <Label htmlFor="fullStory" className="text-zinc-200">
            Full Story & Motivation <span className="text-rose-400">*</span>
          </Label>
          <textarea
            id="fullStory"
            rows={5}
            placeholder="Provide full context, team background, and why backers should support this campaign..."
            value={data.fullStory}
            onChange={(e) => updateField("fullStory", e.target.value)}
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-purple-500 focus:outline-none"
          />
          {errors.fullStory && <p className="mt-1 text-xs text-rose-400">{errors.fullStory}</p>}
        </div>

        <div>
          <Label htmlFor="imageUrl" className="text-zinc-200 flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4 text-purple-400" />
            Cover Image URL (Optional)
          </Label>
          <Input
            id="imageUrl"
            placeholder="https://images.unsplash.com/photo-..."
            value={data.imageUrl}
            onChange={(e) => updateField("imageUrl", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
          />
          {errors.imageUrl && <p className="mt-1 text-xs text-rose-400">{errors.imageUrl}</p>}
        </div>
      </div>
    </div>
  );
}

// Step 2: Goals Component
export function GoalsStep({ data, errors, updateField }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-400" />
          Step 2: Funding Goals & Currency
        </h3>
        <p className="text-sm text-zinc-400">Configure target raise amounts, token choices, and backer limits.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="goalAmount" className="text-zinc-200">
            Target Goal Amount <span className="text-rose-400">*</span>
          </Label>
          <Input
            id="goalAmount"
            type="number"
            placeholder="50000"
            value={data.goalAmount}
            onChange={(e) => updateField("goalAmount", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500"
          />
          {errors.goalAmount && <p className="mt-1 text-xs text-rose-400">{errors.goalAmount}</p>}
        </div>

        <div>
          <Label htmlFor="token" className="text-zinc-200">
            Accepted Token / Asset <span className="text-rose-400">*</span>
          </Label>
          <select
            id="token"
            value={data.token}
            onChange={(e) => updateField("token", e.target.value)}
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
          >
            {TOKEN_OPTIONS.map((tok) => (
              <option key={tok.value} value={tok.value}>
                {tok.label}
              </option>
            ))}
          </select>
          {errors.token && <p className="mt-1 text-xs text-rose-400">{errors.token}</p>}
        </div>

        <div>
          <Label htmlFor="targetBackers" className="text-zinc-200">
            Target Backer Count
          </Label>
          <Input
            id="targetBackers"
            type="number"
            placeholder="100"
            value={data.targetBackers}
            onChange={(e) => updateField("targetBackers", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
          />
          {errors.targetBackers && <p className="mt-1 text-xs text-rose-400">{errors.targetBackers}</p>}
        </div>

        <div>
          <Label htmlFor="minContribution" className="text-zinc-200">
            Minimum Contribution ({data.token})
          </Label>
          <Input
            id="minContribution"
            type="number"
            placeholder="10"
            value={data.minContribution}
            onChange={(e) => updateField("minContribution", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
          />
          {errors.minContribution && <p className="mt-1 text-xs text-rose-400">{errors.minContribution}</p>}
        </div>
      </div>
    </div>
  );
}

// Step 3: Timeline Component
interface TimelineStepProps extends StepProps {
  addMilestone: (milestone: Omit<MilestoneItem, "id">) => void;
  removeMilestone: (id: string) => void;
}

export function TimelineStep({ data, errors, updateField, addMilestone, removeMilestone }: TimelineStepProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const handleAdd = () => {
    if (!newTitle.trim() || !newDate) return;
    addMilestone({
      title: newTitle,
      targetDate: newDate,
      description: newDesc,
    });
    setNewTitle("");
    setNewDate("");
    setNewDesc("");
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-emerald-400" />
          Step 3: Timeline & Milestones
        </h3>
        <p className="text-sm text-zinc-400">Define launch start date, campaign end date, and key deliverables.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="startDate" className="text-zinc-200">
            Campaign Start Date <span className="text-rose-400">*</span>
          </Label>
          <Input
            id="startDate"
            type="date"
            value={data.startDate}
            onChange={(e) => updateField("startDate", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 focus:border-emerald-500"
          />
          {errors.startDate && <p className="mt-1 text-xs text-rose-400">{errors.startDate}</p>}
        </div>

        <div>
          <Label htmlFor="endDate" className="text-zinc-200">
            Campaign End Date <span className="text-rose-400">*</span>
          </Label>
          <Input
            id="endDate"
            type="date"
            value={data.endDate}
            onChange={(e) => updateField("endDate", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 focus:border-emerald-500"
          />
          {errors.endDate && <p className="mt-1 text-xs text-rose-400">{errors.endDate}</p>}
        </div>
      </div>

      {/* Milestones list */}
      <div className="mt-6 space-y-4">
        <h4 className="text-sm font-semibold text-zinc-200">Key Project Milestones</h4>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              placeholder="Milestone title (e.g. Phase 1 Release)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100 text-xs"
            />
            <Input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="border-zinc-700 bg-zinc-900 text-zinc-100 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAdd}
              disabled={!newTitle || !newDate}
              className="border-emerald-600 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Milestone
            </Button>
          </div>
          <Input
            placeholder="Brief description of deliverables for this milestone..."
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="border-zinc-700 bg-zinc-900 text-zinc-100 text-xs"
          />
        </div>

        {data.milestones.length > 0 && (
          <div className="space-y-2">
            {data.milestones.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-100">{m.title}</span>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">
                      {m.targetDate}
                    </Badge>
                  </div>
                  {m.description && <p className="text-xs text-zinc-400 mt-1">{m.description}</p>}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMilestone(m.id)}
                  className="text-zinc-500 hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Step 4: Impact Component
export function ImpactStep({ data, errors, updateField }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          Step 4: Impact Statement & Metrics
        </h3>
        <p className="text-sm text-zinc-400">Specify measurable environmental or social outcomes and target beneficiaries.</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="impactStatement" className="text-zinc-200">
            Impact Statement <span className="text-rose-400">*</span>
          </Label>
          <textarea
            id="impactStatement"
            rows={4}
            placeholder="Explain the tangible, real-world impact this campaign will achieve if funded..."
            value={data.impactStatement}
            onChange={(e) => updateField("impactStatement", e.target.value)}
            className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
          />
          {errors.impactStatement && <p className="mt-1 text-xs text-rose-400">{errors.impactStatement}</p>}
        </div>

        <div>
          <Label htmlFor="targetBeneficiaries" className="text-zinc-200">
            Target Beneficiaries <span className="text-rose-400">*</span>
          </Label>
          <Input
            id="targetBeneficiaries"
            placeholder="e.g. 5,000 local community members in Amazon Basin"
            value={data.targetBeneficiaries}
            onChange={(e) => updateField("targetBeneficiaries", e.target.value)}
            className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
          />
          {errors.targetBeneficiaries && <p className="mt-1 text-xs text-rose-400">{errors.targetBeneficiaries}</p>}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="co2OffsetTons" className="text-zinc-200">
              Estimated CO2 Offset (Metric Tons)
            </Label>
            <Input
              id="co2OffsetTons"
              type="number"
              placeholder="150"
              value={data.co2OffsetTons}
              onChange={(e) => updateField("co2OffsetTons", e.target.value)}
              className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
            />
            {errors.co2OffsetTons && <p className="mt-1 text-xs text-rose-400">{errors.co2OffsetTons}</p>}
          </div>

          <div>
            <Label htmlFor="socialMetrics" className="text-zinc-200">
              Social Impact KPI (Optional)
            </Label>
            <Input
              id="socialMetrics"
              placeholder="e.g. 12 clean water wells installed"
              value={data.socialMetrics}
              onChange={(e) => updateField("socialMetrics", e.target.value)}
              className="mt-1.5 border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 5: Preview Component
export function PreviewStep({ data, errors }: { data: CampaignWizardData; errors: WizardStepErrors }) {
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Step 5: Preview & Final Review
          </h3>
          <p className="text-sm text-zinc-400">Review all campaign parameters prior to publishing onto Stellar.</p>
        </div>
        <Badge
          variant={hasErrors ? "destructive" : "outline"}
          className={hasErrors ? "" : "border-emerald-500 text-emerald-400"}
        >
          {hasErrors ? "Validation Errors Present" : "Ready to Publish"}
        </Badge>
      </div>

      {hasErrors && (
        <div className="rounded-lg border border-rose-800/50 bg-rose-950/30 p-4 text-xs text-rose-300 space-y-1">
          <p className="font-semibold text-rose-200">Please fix the following validation errors before launching:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {Object.entries(errors).map(([key, msg]) => (
              <li key={key}>
                <span className="font-medium capitalize">{key}</span>: {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Basic Info */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
          <span className="text-xs uppercase font-semibold text-purple-400">1. Details</span>
          <h4 className="text-base font-semibold text-zinc-100">{data.title || "Untitled Campaign"}</h4>
          <Badge className="bg-purple-900/50 text-purple-300 border-purple-700">{data.category}</Badge>
          <p className="text-xs text-zinc-300">{data.shortDescription}</p>
          <p className="text-xs text-zinc-400 line-clamp-3">{data.fullStory}</p>
        </div>

        {/* Financial Goals */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
          <span className="text-xs uppercase font-semibold text-blue-400">2. Funding Goals</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-50">{data.goalAmount || "0"}</span>
            <span className="text-sm font-semibold text-blue-400">{data.token}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 pt-2 border-t border-zinc-800">
            <div>Target Backers: <span className="text-zinc-200 font-medium">{data.targetBackers || "N/A"}</span></div>
            <div>Min Contribution: <span className="text-zinc-200 font-medium">{data.minContribution} {data.token}</span></div>
          </div>
        </div>

        {/* Timeline */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
          <span className="text-xs uppercase font-semibold text-emerald-400">3. Timeline & Milestones</span>
          <div className="text-xs text-zinc-300 flex items-center justify-between">
            <span>Start: <strong className="text-zinc-100">{data.startDate}</strong></span>
            <span>End: <strong className="text-zinc-100">{data.endDate}</strong></span>
          </div>
          <div className="text-xs text-zinc-400 pt-2 border-t border-zinc-800">
            Milestones defined: <span className="text-emerald-400 font-semibold">{data.milestones.length}</span>
          </div>
        </div>

        {/* Impact */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 space-y-2">
          <span className="text-xs uppercase font-semibold text-amber-400">4. Impact Statement</span>
          <p className="text-xs text-zinc-300 italic">"{data.impactStatement || "No impact statement set"}"</p>
          <div className="text-xs text-zinc-400 pt-2 border-t border-zinc-800 flex justify-between">
            <span>Beneficiaries: <strong className="text-zinc-200">{data.targetBeneficiaries || "N/A"}</strong></span>
            <span>CO2 Offset: <strong className="text-amber-300">{data.co2OffsetTons} Tons</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
