"use client";

import Image from "next/image";
import { Clock3, MapPin, ShieldCheck, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { VerificationEvidence } from "@/types/campaign-verification";

export function VerificationEvidenceGallery({ evidence }: { evidence: VerificationEvidence[] }) {
  if (evidence.length === 0) return null;
  return (
    <section aria-labelledby="verification-evidence-heading" className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          <h2 id="verification-evidence-heading" className="text-xl font-semibold">Verification evidence</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Media published with capture metadata and verifier attribution.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {evidence.map((item) => (
          <article key={item.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            {/* Wrap in a plain div instead of <a> for the image container —
                using an anchor as the sole wrapper around next/image can
                cause iOS 14 Safari to issue a non-CORS preflight that the
                CDN rejects, leaving the image blank. The external link is
                preserved as a dedicated button below the media. */}
            <div className="block bg-zinc-100 dark:bg-zinc-900">
              {item.type === "video" ? (
                <div className="flex aspect-video items-center justify-center text-zinc-500"><Video className="h-10 w-10" /></div>
              ) : (
                <Image
                  src={item.url}
                  alt={item.caption || "Campaign verification evidence"}
                  width={800}
                  height={450}
                  unoptimized
                  className="aspect-video w-full object-cover"
                  // crossOrigin="anonymous" ensures Safari makes a CORS
                  // request so the response is never stored as opaque in
                  // the browser cache — the root cause of the iOS 14 failure.
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              )}
            </div>
            <div className="space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{item.type}</Badge>
                {item.verifierId && <span className="font-mono text-xs text-zinc-500">{item.verifierId}</span>}
              </div>
              {item.caption && <p className="text-zinc-700 dark:text-zinc-300">{item.caption}</p>}
              <div className="grid gap-1 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Captured {new Date(item.capturedAt).toLocaleString()}</span>
                {item.latitude !== undefined && item.longitude !== undefined && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span>}
              </div>
              {/* Explicit link preserves external-navigation intent that was
                  previously baked into the wrapping <a> around the image.
                  Separating image loading from navigation prevents iOS 14
                  Safari from conflating the CORS image request with the
                  anchor's navigation context. */}
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs font-medium text-fundable-purple-2 underline underline-offset-2"
              >
                View original ↗
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
