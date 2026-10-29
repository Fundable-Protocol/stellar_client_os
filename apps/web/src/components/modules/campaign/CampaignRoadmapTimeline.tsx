"use client";
import { CalendarDays, CheckCircle2, Circle } from "lucide-react";
import type { MilestoneItem } from "../wizard/campaign-wizard-config";

export interface RoadmapPhase extends MilestoneItem { completed?: boolean }
export function CampaignRoadmapTimeline({ phases, title = "Project roadmap" }: { phases: RoadmapPhase[]; title?: string }) {
  if (!phases.length) return null;
  return (
    <section aria-labelledby="campaign-roadmap-heading" className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-6 flex items-start gap-3">
        <CalendarDays className="mt-0.5 h-5 w-5 text-purple-500" />
        <div><h2 id="campaign-roadmap-heading" className="text-xl font-bold text-zinc-950 dark:text-white">{title}</h2><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Follow the phases and expected delivery dates.</p></div>
      </div>
      <ol className="grid gap-5 md:grid-cols-4 md:gap-0">
        {phases.map((phase, index) => (
          <li key={phase.id} className="relative flex gap-3 md:block md:pr-5">
            {index < phases.length - 1 && <span aria-hidden="true" className="absolute left-3 top-7 hidden h-px w-[calc(100%-1.5rem)] bg-purple-200 dark:bg-purple-900 md:block" />}
            <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">{phase.completed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}</span>
            <div className="md:mt-3"><time className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400" dateTime={phase.targetDate}>{new Date(phase.targetDate).toLocaleDateString()}</time><h3 className="mt-1 font-semibold text-zinc-900 dark:text-white">{phase.title}</h3><p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{phase.description}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
