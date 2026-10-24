import type { StretchGoal } from "@/services/campaign-stretch-goals.service";

export function StretchGoals({ goals, raisedAmount }: { goals: StretchGoal[]; raisedAmount: string }) {
  if (!goals.length) return null;
  const raised = BigInt(/^\d+$/.test(raisedAmount) ? raisedAmount : "0");
  return (
    <section aria-labelledby="stretch-goals-heading" className="rounded-xl border border-violet-200 bg-violet-50 p-6 dark:border-violet-900/50 dark:bg-violet-950/20">
      <h2 id="stretch-goals-heading" className="text-xl font-bold">Stretch goals</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Unlock additional deliverables as funding grows beyond the primary target.</p>
      <div className="mt-4 space-y-4">
        {goals.map((goal) => {
          const target = goal.targetAmount && /^\d+$/.test(goal.targetAmount) ? BigInt(goal.targetAmount) : raised;
          const progress = target > 0n ? Math.min(100, Number((raised * 100n) / target)) : 0;
          return <article key={goal.id} className="rounded-lg border border-violet-200 bg-white p-4 dark:border-violet-900/50 dark:bg-zinc-950" data-testid="stretch-goal">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{goal.title}</h3>{goal.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{goal.description}</p>}</div><span className="text-xs font-medium uppercase tracking-wide text-violet-700 dark:text-violet-300">{goal.status}</span></div>
            {goal.targetAmount && <><div className="mt-3 flex justify-between text-xs text-zinc-600 dark:text-zinc-400"><span>{raised.toString()} raised</span><span>{goal.targetAmount} target</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-label={`${goal.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-violet-600" style={{ width: `${progress}%` }} /></div></>}
            <ul className="mt-3 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">{goal.rewards.map((reward) => <li key={reward.id}>{reward.title}{reward.description ? ` — ${reward.description}` : ""}</li>)}</ul>
          </article>;
        })}
      </div>
    </section>
  );
}
