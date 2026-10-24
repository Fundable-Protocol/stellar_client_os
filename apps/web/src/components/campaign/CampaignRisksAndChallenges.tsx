import type { ReactNode } from "react";

function renderInlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function CampaignRisksAndChallenges({ content }: { content?: string }) {
  const lines = (content ?? "").trim().split(/\r?\n/);
  const hasContent = Boolean(content?.trim());
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {listItems.map((item, index) => (
          <li key={`${index}-${item}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  for (const [index, line] of lines.entries()) {
    if (line.trimStart().startsWith("- ")) {
      listItems.push(line.trimStart().slice(2));
      continue;
    }
    flushList();
    if (line.trim()) {
      blocks.push(<p key={`paragraph-${index}`}>{renderInlineMarkdown(line)}</p>);
    }
  }
  flushList();

  return (
    <section
      aria-labelledby="campaign-risks-heading"
      className="rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 id="campaign-risks-heading" className="text-xl font-semibold text-foreground">
        Risks and Challenges
      </h2>
      {hasContent ? (
        <div className="mt-3 space-y-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {blocks}
        </div>
      ) : (
        <p
          role="status"
          className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          The creator has not completed this section yet.
        </p>
      )}
    </section>
  );
}
