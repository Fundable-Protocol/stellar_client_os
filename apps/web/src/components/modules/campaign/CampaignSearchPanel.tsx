"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

interface SearchResult {
  campaign: { id: string; name: string; location?: string; species?: string[] };
  highlights: string[];
}

export function CampaignSearchPanel() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [species, setSpecies] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (location.trim()) params.set("location", location.trim());
      if (species.trim()) params.set("species", species.trim());
      const response = await fetch(`/api/campaigns/search?${params}`);
      const payload = await response.json() as { data?: SearchResult[] };
      setResults(payload.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <form onSubmit={search} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campaigns, creators, or species" aria-label="Campaign search" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
        <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" aria-label="Location filter" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
        <input value={species} onChange={(event) => setSpecies(event.target.value)} placeholder="Species" aria-label="Species filter" className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
        <button type="submit" disabled={loading} className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{loading ? "Searching…" : "Search"}</button>
      </form>
      {results.length > 0 && <ul className="mt-4 space-y-2" aria-label="Search results">{results.map(({ campaign, highlights }) => <li key={campaign.id} className="rounded-md border border-zinc-800 px-3 py-2 text-sm"><Link className="font-semibold text-purple-300" href={`/campaigns/${campaign.id}`}>{campaign.name}</Link><span className="ml-2 text-zinc-500">{highlights.join(" · ")}</span></li>)}</ul>}
      {query && !loading && results.length === 0 && <p className="mt-3 text-xs text-zinc-500">No campaigns matched all search terms.</p>}
    </section>
  );
}
