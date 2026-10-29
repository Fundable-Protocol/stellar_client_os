"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/providers/StellarWalletProvider";
import {
  readCampaignRecommendationPreferences,
  saveCampaignRecommendationPreferences,
  type CampaignRecommendationPreferences,
} from "@/lib/campaign-recommendation-preferences";

type PreferenceText = Record<keyof CampaignRecommendationPreferences, string>;

const preferenceFields: { key: keyof PreferenceText; label: string; hint: string }[] = [
  { key: "species", label: "Tree species", hint: "For example: mangrove, teak, cedar" },
  { key: "geographicInterests", label: "Places and regions", hint: "For example: Kenya, Amazon, coastal communities" },
  { key: "environmentalCauses", label: "Environmental causes", hint: "For example: reforestation, biodiversity, coastal restoration" },
];

export function CampaignRecommendationPreferencesForm() {
  const { address, openModal } = useWallet();
  const [values, setValues] = useState<PreferenceText>({
    species: "",
    geographicInterests: "",
    environmentalCauses: "",
  });
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!address) return;
    const preferences = readCampaignRecommendationPreferences(address);
    setValues({
      species: preferences.species.join(", "),
      geographicInterests: preferences.geographicInterests.join(", "),
      environmentalCauses: preferences.environmentalCauses.join(", "),
    });
  }, [address]);

  const save = () => {
    if (!address) return;
    const splitValues = (value: string) =>
      value.split(",").map((entry) => entry.trim()).filter(Boolean);
    const preferences: CampaignRecommendationPreferences = {
      species: splitValues(values.species),
      geographicInterests: splitValues(values.geographicInterests),
      environmentalCauses: splitValues(values.environmentalCauses),
    };
    if (!saveCampaignRecommendationPreferences(address, preferences)) {
      setStatus("Your browser could not save these preferences. Check storage permissions and try again.");
      return;
    }
    setStatus("Your recommendation preferences have been saved.");
  };

  return (
    <main className="mx-auto max-w-2xl space-y-6 py-8">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to dashboard
      </Link>
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-white">Campaign recommendation preferences</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Choose interests to personalize campaign suggestions. Your preferences are saved in this browser for your connected wallet.
        </p>
        {!address ? (
          <div className="mt-6">
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Connect your wallet to manage account-specific preferences.</p>
            <Button type="button" onClick={openModal}>Connect wallet</Button>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {preferenceFields.map(({ key, label, hint }) => (
              <div key={key}>
                <label htmlFor={`recommendation-${key}`} className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</label>
                <input
                  id={`recommendation-${key}`}
                  value={values[key]}
                  onChange={(event) => {
                    setValues((current) => ({ ...current, [key]: event.target.value }));
                    setStatus("");
                  }}
                  placeholder={hint}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-fundable-purple-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
                <p className="mt-1 text-xs text-zinc-500">{hint}; separate multiple interests with commas.</p>
              </div>
            ))}
            <div className="flex items-center gap-4">
              <Button type="button" onClick={save}>Save preferences</Button>
              {status && <p role="status" className="text-sm text-zinc-600 dark:text-zinc-300">{status}</p>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
