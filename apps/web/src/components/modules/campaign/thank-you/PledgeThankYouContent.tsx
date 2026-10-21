import Image from "next/image";

export interface PledgeThankYouDetails {
  greeting?: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  nextSteps?: string;
}

export function getVideoEmbedUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.match(/^\/([^/]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host)) {
      const id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
    }
    if (host === "vimeo.com" || host === "www.vimeo.com") {
      const id = url.pathname.match(/^\/(\d+)/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function renderRichText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, lineIndex) => (
    <span key={`${lineIndex}-${line}`}>
      {line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, partIndex) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={partIndex}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={partIndex}>{part.slice(1, -1)}</em>;
        }
        return part;
      })}
      {lineIndex < lines.length - 1 && <br />}
    </span>
  ));
}

export function PledgeThankYouContent({ details }: { details: PledgeThankYouDetails }) {
  const embedUrl = getVideoEmbedUrl(details.videoUrl);
  return (
    <section aria-label="Creator thank-you message" className="mt-6 space-y-4 rounded-xl border border-emerald-500/20 bg-zinc-950/50 p-5">
      <h3 className="text-lg font-semibold text-emerald-200">{details.greeting || "A message from the creator"}</h3>
      {details.body && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{renderRichText(details.body)}</p>}
      {details.imageUrl && (
        // Campaign images are creator-provided external HTTPS URLs.
        <Image src={details.imageUrl} alt="Campaign thank-you" width={1200} height={675} unoptimized className="max-h-80 w-full rounded-lg object-cover" />
      )}
      {embedUrl && (
        <div className="aspect-video overflow-hidden rounded-lg">
          <iframe
            src={embedUrl}
            title="Campaign thank-you video"
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {details.nextSteps && (
        <div>
          <h4 className="text-sm font-semibold text-zinc-100">What happens next</h4>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{renderRichText(details.nextSteps)}</p>
        </div>
      )}
    </section>
  );
}
