"use client";

import { useEffect, useState } from "react";
import { Check, LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
}

export function CampaignTemplateGallery({ onSelect }: { onSelect?: (template: Template) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/campaign-templates")
      .then((response) => response.json())
      .then((body: { templates?: Template[] }) => setTemplates(body.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);
  const categories = ["all", ...new Set(templates.map((template) => template.category))];
  const visible = category === "all" ? templates : templates.filter((template) => template.category === category);
  return (
    <section aria-label="Campaign templates" className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-100"><LayoutTemplate className="h-5 w-5 text-purple-400" /> Start from a template</h2>
          <p className="mt-1 text-sm text-zinc-400">Choose a category-specific starting point. Your new campaign will remain a draft until you publish it.</p>
        </div>
        <select aria-label="Filter templates by category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
          {categories.map((item) => <option key={item} value={item}>{item === "all" ? "All categories" : item}</option>)}
        </select>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {visible.map((template) => (
          <button key={template.id} type="button" onClick={() => { setSelected(template.id); onSelect?.(template); }} className={`rounded-lg border p-4 text-left transition ${selected === template.id ? "border-purple-500 bg-purple-950/30" : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-600"}`}>
            <div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-zinc-100">{template.name}</h3>{selected === template.id && <Check className="h-4 w-4 text-emerald-400" />}</div>
            <Badge variant="outline" className="mt-2 border-zinc-700 text-[10px] text-zinc-400">{template.category}</Badge>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">{template.description}</p>
          </button>
        ))}
      </div>
      {selected && <Button type="button" size="sm" variant="outline" className="mt-4 border-purple-700 text-purple-300" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Continue with selected template</Button>}
    </section>
  );
}
