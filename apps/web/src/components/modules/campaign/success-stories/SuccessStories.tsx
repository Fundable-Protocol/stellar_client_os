"use client";

import React, { useEffect, useState } from "react";
import { Trophy, Star, Quote, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSuccessStories, SuccessStory } from "@/services/campaign-success.service";

export default function SuccessStories() {
  const [stories, setStories] = useState<SuccessStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStories = async () => {
      try {
        const data = await getSuccessStories();
        setStories(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load success stories");
      } finally {
        setLoading(false);
      }
    };
    fetchStories();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl animate-pulse">
        <div className="h-6 w-40 bg-zinc-800 rounded mb-4" />
        <div className="grid md-grid-cols-2 gap-6">
          <div className="h-48 bg-zinc-800 rounded" />
          <div className="h-48 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-6 text-red-300">
        <p className="text-sm font-semibold">Error loading success stories:</p>
        <p className="text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (stories.length === 0) {
    return null; // or some fallback
  }

  return (
    <section className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-2xl font-extrabold text-zinc-50 tracking-tight flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-400" />
          Success Stories
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Campaigns that shipped and delivered real impact. Hear directly from creators and backers.
        </p>
      </div>

      <div className="grid grid-cols-1 md-grid-cols-2 gap-6">
        {stories.map((story) => {
          const progress = Math.round(
            (parseFloat(story.raisedAmount.replace(/,/g, "")) /
              parseFloat(story.goalAmount.replace(/,/g, "")) ) *
              100
          );

          return (
            <article
              key={story.id}
              className="flex flex-col rounded-xl border border-emerald-500/30 bg-zinc-900/80 p-6 shadow-xl transition-all duration-300 hover:border-emerald-400/50 hover-shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <Badge className="bg-emerald-950/60 text-emerald-300 border-emerald-800 text-[11px]">
                    {story.category}
                  </Badge>
                  <h3 className="text-xl font-bold text-zinc-100">{story.title}</h3>
                  <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                    {story.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 grid-gap-4 text-xs">
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-zinc-500">Raised</p>
                  <p className="font-bold text-zinc-100">
                    {story.raisedAmount} {story.token}
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-zinc-500">Progress</p>
                  <p className="font-bold text-emerald-40">{progress}%</p>
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-lg border border-purple-500/20 bg-purple-950/20 p-4">
                <div className="flex items-center gap-2 text-purple-300 text-xs font-semibold uppercase tracking-wide">
                  <Quote className="h-3.5 w-3.5" /> Creator Interview
                </div>
                <blockquote className="text-sm text-zinc-300 italic leading-relaxed">
                  “{story.creatorInterview.quote}”
                </blockquote>
                <figcaption className="text-xs text-zinc-500">
                  -¬ {story.creatorInterview.author}, {story.creatorInterview.role}
                </figcaption>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold uppercase tracking-wide">
                  <Users className="h-3.5 w-3.5" /> Backer Testimonials
                </div>
                {story.backerTestimonials.slice(0, 2).map((testimonial) => (
                  <div key={testimonial.id} className="rounded-lg bg-zinc-800/30 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-300">{testimonial.author}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({length: testimonial.rating ?? 5}).map((_, i) => (
                          <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{testimonial.content}</p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}