"use client";

import React, { useState } from "react";
import { Check, Copy, Download, Mail, Palette, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MARKETING_TEMPLATE_SECTIONS,
  type MarketingSectionId,
  type MarketingTemplateItem,
} from "./marketing-templates.data";

const SECTION_ICONS: Record<MarketingSectionId, React.ReactNode> = {
  email: <Mail aria-hidden="true" className="h-4 w-4 text-purple-300" />,
  social: <Palette aria-hidden="true" className="h-4 w-4 text-pink-300" />,
  deck: <Presentation aria-hidden="true" className="h-4 w-4 text-emerald-300" />,
};

const COPY_RESET_MS = 2000;

function downloadTemplate(item: MarketingTemplateItem) {
  const blob = new Blob([item.content], { type: `${item.mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = item.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const MarketingTemplates: React.FC = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = async (item: MarketingTemplateItem) => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopiedId(item.id);
      setCopyFailed(false);
      window.setTimeout(() => {
        setCopiedId((current) => (current === item.id ? null : current));
      }, COPY_RESET_MS);
    } catch {
      setCopiedId(null);
      setCopyFailed(true);
    }
  };

  return (
    <div className="space-y-6" data-testid="marketing-templates">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="text-2xl font-extrabold text-zinc-50 tracking-tight">
          Campaign Creator Toolkit: Marketing Templates
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Copy or download ready-made email templates, social graphics, and pitch decks —
          then replace the {"{{placeholders}}"} with your campaign details.
        </p>
      </div>

      <p aria-live="polite" className="sr-only">
        {copiedId ? "Template copied to clipboard" : copyFailed ? "Copy failed" : ""}
      </p>

      {MARKETING_TEMPLATE_SECTIONS.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`marketing-section-${section.id}`}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-content-center rounded-full bg-black ring-1 ring-purple-500/40"
            >
              {SECTION_ICONS[section.id]}
            </span>
            <div>
              <h3
                id={`marketing-section-${section.id}`}
                className="text-lg font-bold text-zinc-100"
              >
                {section.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-400">{section.description}</p>
            </div>
          </div>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.templates.map((item) => {
              const isCopied = copiedId === item.id;

              return (
                <li
                  key={item.id}
                  className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-black/40 p-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{item.title}</p>
                    <p className="mt-1 text-xs text-zinc-400">{item.description}</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-zinc-500">
                      {item.filename}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Copy ${item.title}`}
                      onClick={() => handleCopy(item)}
                      className={cn(
                        "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-zinc-100",
                        isCopied && "border-emerald-700 text-emerald-300",
                      )}
                    >
                      {isCopied ? (
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      ) : (
                        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                      )}
                      {isCopied ? "Copied" : "Copy"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`Download ${item.title}`}
                      onClick={() => downloadTemplate(item)}
                      className="border-purple-800 bg-purple-950/40 text-purple-300 hover:bg-purple-900/60"
                    >
                      <Download aria-hidden="true" className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};
