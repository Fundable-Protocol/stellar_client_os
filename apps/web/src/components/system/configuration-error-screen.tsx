import type { EnvValidationIssue } from "@/lib/env-validation";

type ConfigurationErrorScreenProps = {
  issues: EnvValidationIssue[];
  isDevelopment: boolean;
};

export function ConfigurationErrorScreen({
  issues,
  isDevelopment,
}: ConfigurationErrorScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-50">
      <div className="w-full max-w-3xl rounded-3xl border border-red-500/30 bg-slate-900/95 p-8 shadow-2xl shadow-red-950/30">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-300">
            Configuration Error
          </p>
          <h1 className="text-3xl font-semibold text-white">
            {isDevelopment
              ? "Required environment variables are missing or invalid."
              : "The application is temporarily unavailable."}
          </h1>
          <p className="text-sm leading-6 text-slate-300">
            {isDevelopment
              ? "Update your environment configuration, restart the app, and try again."
              : "A required runtime configuration could not be loaded. Please contact the team maintaining this deployment."}
          </p>
        </div>

        {isDevelopment ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5">
              <h2 className="text-sm font-semibold text-red-200">
                Invalid variables
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-red-50">
                {issues.map((issue) => (
                  <li
                    key={`${issue.key}-${issue.message}`}
                    className="rounded-xl bg-black/20 px-3 py-2 font-mono"
                  >
                    {issue.key}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 text-sm text-slate-300">
              Copy `.env.example` to `.env.local`, fill in every required
              `NEXT_PUBLIC_*` value, then restart the dev server.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
