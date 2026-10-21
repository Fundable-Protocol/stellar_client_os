import { useMemo } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Renders a Markdown body of a campaign update.
 *
 * `renderMarkdown` escapes every raw HTML tag in the source before parsing
 * and only emits a fixed set of tags itself, so the produced HTML is safe to
 * inject.
 */
export interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdown(content ?? ""), [content]);

  return (
    <div
      className={cn(
        "space-y-3 text-sm leading-relaxed text-zinc-300",
        "[&_a]:text-purple-400 [&_a]:underline [&_a]:hover:text-purple-300",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-purple-600/60 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-zinc-400",
        "[&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:text-emerald-300",
        "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-zinc-50",
        "[&_h2]:text-base [&_h2]:font-bold [&_h2]:text-zinc-50",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-100",
        "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-zinc-100",
        "[&_hr]:border-zinc-800",
        "[&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-zinc-800",
        "[&_li]:ml-4 [&_li]:list-disc [&_list-decimal]:list-decimal [&_ol]:ml-4 [&_ul]:ml-4",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:text-zinc-300",
        "[&_strong]:font-semibold [&_strong]:text-zinc-100",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default MarkdownRenderer;
