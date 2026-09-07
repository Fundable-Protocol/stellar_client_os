"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FAQ_ITEMS, type FaqItem } from "./faqData";

const CATEGORIES = ["All", ...new Set(FAQ_ITEMS.map((item) => item.category))] as const;

function matchesQuery(item: FaqItem, query: string) {
  if (!query) return true;
  const haystack = `${item.question} ${item.answer}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function FaqPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(() => {
    return FAQ_ITEMS.filter(
      (item) =>
        (category === "All" || item.category === category) && matchesQuery(item, query)
    );
  }, [query, category]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Frequently Asked Questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Common questions from sponsors and planters. Search below or browse by category.
        </p>
      </div>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          placeholder="Search the FAQ..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search frequently asked questions"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {CATEGORIES.map((item) => (
          <button key={item} type="button" onClick={() => setCategory(item)}>
            <Badge
              variant={category === item ? "default" : "outline"}
              className="cursor-pointer select-none"
            >
              {item}
            </Badge>
          </button>
        ))}
      </div>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {results.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No questions match &ldquo;{query}&rdquo;. Try a different search term.
          </p>
        )}

        {results.map((item) => {
          const isOpen = openId === item.id;
          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : item.id)}
                aria-expanded={isOpen}
                aria-controls={`faq-answer-${item.id}`}
                className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
              >
                <span className="text-sm font-medium text-white">{item.question}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
              {isOpen && (
                <p
                  id={`faq-answer-${item.id}`}
                  className="px-4 pb-4 text-sm text-muted-foreground"
                >
                  {item.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
