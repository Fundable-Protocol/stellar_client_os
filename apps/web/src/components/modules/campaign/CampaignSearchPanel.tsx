"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CATEGORY_OPTIONS } from "@/components/modules/campaign/wizard/campaign-wizard-config";

interface SearchResult {
  campaign: { id: string; name: string; location?: string; species?: string[] };
  highlights: string[];
}

interface PopularSuggestion {
  id: string;
  name: string;
  location?: string;
  category?: string;
  sponsorCount?: number;
}

const DAYS_REMAINING_OPTIONS = [
  { value: "", label: "Any time remaining" },
  { value: "7", label: "Closing within 7 days" },
  { value: "30", label: "Closing within 30 days" },
  { value: "90", label: "Closing within 90 days" },
];

export function CampaignSearchPanel() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const [minGoalAmount, setMinGoalAmount] = useState("");
  const [maxGoalAmount, setMaxGoalAmount] = useState("");
  const [maxDaysRemaining, setMaxDaysRemaining] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<PopularSuggestion[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (location.trim()) params.set("location", location.trim());
      if (category) params.set("category", category);
      if (minGoalAmount.trim()) params.set("minGoalAmount", minGoalAmount.trim());
      if (maxGoalAmount.trim()) params.set("maxGoalAmount", maxGoalAmount.trim());
      if (maxDaysRemaining) params.set("maxDaysRemaining", maxDaysRemaining);

      const response = await fetch(`/api/campaigns/search?${params}`);
      const payload = await response.json() as {
        data?: SearchResult[];
        suggestions?: PopularSuggestion[];
        error?: string;
      };
      if (!response.ok) {
        setResults([]);
        setSuggestions([]);
        setError(payload.error ?? "Search failed. Please try again.");
        return;
      }
      setResults(payload.data ?? []);
      setSuggestions(payload.suggestions ?? []);
    } catch {
      setResults([]);
      setSuggestions([]);
      setError("Search is unavailable right now. Please try again.");
    } finally {
      setSearched(true);
      setLoading(false);
    }
  }

  const noResults = searched && !loading && !error && results.length === 0;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4" aria-label="Campaign search and filters">
      <form onSubmit={search} className="grid gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search campaigns by title, description, or tags"
          aria-label="Campaign search"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-300">
            Location
            <input
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Any location"
              aria-label="Location filter"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-300">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Category filter"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">All categories</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.label}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-300">
            Days remaining
            <select
              value={maxDaysRemaining}
              onChange={(event) => setMaxDaysRemaining(event.target.value)}
              aria-label="Days remaining filter"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            >
              {DAYS_REMAINING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-300">
            Minimum goal
            <input
              value={minGoalAmount}
              onChange={(event) => setMinGoalAmount(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 1000"
              aria-label="Minimum funding goal"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-300">
            Maximum goal
            <input
              value={maxGoalAmount}
              onChange={(event) => setMaxGoalAmount(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 50000"
              aria-label="Maximum funding goal"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="self-end rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      <p className="mt-3 text-xs text-zinc-400" role="status" aria-live="polite">
        {error
          ? error
          : loading
            ? "Searching campaigns…"
            : searched
              ? `${results.length} campaign${results.length === 1 ? "" : "s"} matched`
              : "Search by keyword and narrow the results with filters."}
      </p>

      {results.length > 0 && (
        <ul className="mt-2 space-y-2" aria-label="Search results">
          {results.map(({ campaign, highlights }) => (
            <li key={campaign.id} className="rounded-md border border-zinc-800 px-3 py-2 text-sm">
              <Link className="font-semibold text-purple-300" href={`/campaigns/${campaign.id}`}>
                {campaign.name}
              </Link>
              {highlights.length > 0 && <span className="ml-2 text-zinc-500">{highlights.join(" · ")}</span>}
            </li>
          ))}
        </ul>
      )}

      {noResults && (
        <div className="mt-4 rounded-md border border-dashed border-zinc-700 px-3 py-4" role="region" aria-label="Suggested campaigns">
          <h3 className="text-sm font-semibold text-zinc-100">No campaigns matched those filters</h3>
          <p className="mt-1 text-xs text-zinc-400">Popular campaigns you might like:</p>
          {suggestions.length > 0 ? (
            <ul className="mt-2 space-y-1" aria-label="Popular campaigns">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className="text-sm">
                  <Link className="font-semibold text-purple-300" href={`/campaigns/${suggestion.id}`}>
                    {suggestion.name}
                  </Link>
                  {suggestion.sponsorCount !== undefined && (
                    <span className="ml-2 text-xs text-zinc-500">{suggestion.sponsorCount} sponsors</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">Try broadening your search terms or clearing some filters.</p>
          )}
        </div>
      )}
    </section>
  );
}
