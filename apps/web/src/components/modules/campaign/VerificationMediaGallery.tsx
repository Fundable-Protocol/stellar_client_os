import Image from "next/image";
import { Clock3, MapPin, ShieldCheck, Video } from "lucide-react";

interface VerificationMediaBase {
  id: string;
  alt: string;
  caption: string;
  capturedAt: string;
  coordinates: { latitude: number; longitude: number };
  verifier: { name: string; credential: string };
}

export type VerificationMediaItem = VerificationMediaBase & (
  | { type: "photo"; src: string }
  | { type: "video"; src: string; poster: string }
);

interface VerificationMediaGalleryProps {
  items: VerificationMediaItem[];
}

function formatCapturedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

function formatCoordinates({ latitude, longitude }: VerificationMediaItem["coordinates"]): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export function VerificationMediaGallery({ items }: VerificationMediaGalleryProps) {
  return (
    <section aria-labelledby="verification-media-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="verification-media-title" className="flex items-center gap-2 text-lg font-bold text-zinc-100">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 text-emerald-400" />
            Verification Media
          </h3>
          <p className="mt-1 text-xs text-zinc-400">Evidence captured and reviewed in the field</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">{items.length} items</span>
      </div>

      {items.length === 0 ? (
        <p className="border-t border-zinc-800 py-4 text-sm text-zinc-400">No verification media has been published.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((item) => {
            const coordinates = formatCoordinates(item.coordinates);
            const mapUrl = `https://www.openstreetmap.org/?mlat=${item.coordinates.latitude}&mlon=${item.coordinates.longitude}#map=13/${item.coordinates.latitude}/${item.coordinates.longitude}`;

            return (
              <article key={item.id} className="min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
                <div className="relative aspect-video bg-zinc-950">
                  {item.type === "photo" ? (
                    <Image
                      src={item.src}
                      alt={item.alt}
                      width={960}
                      height={540}
                      unoptimized
                      className="h-full w-full object-cover"
                      // crossOrigin="anonymous" prevents iOS 14 Safari from
                      // storing the image as an opaque cache entry and then
                      // refusing to display it in a cross-origin context.
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  ) : (
                    <video
                      aria-label={item.alt}
                      className="h-full w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                      poster={item.poster}
                      // crossOrigin prevents iOS 14 Safari from treating the
                      // poster image as an opaque response in the cache.
                      crossOrigin="anonymous"
                    >
                      <source src={item.src} type="video/mp4" />
                      Your browser does not support embedded video.
                    </video>
                  )}
                  {item.type === "video" && (
                    <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
                      <Video aria-hidden="true" className="h-3 w-3" /> Video
                    </span>
                  )}
                </div>

                <div className="space-y-3 p-3">
                  <p className="truncate text-sm font-semibold text-zinc-100">{item.caption}</p>
                  <dl className="space-y-2 text-xs">
                    <div className="flex items-start gap-2 text-zinc-400">
                      <Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        <dt className="sr-only">Captured</dt>
                        <dd><time dateTime={item.capturedAt}>{formatCapturedAt(item.capturedAt)}</time></dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-zinc-400">
                      <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div>
                        <dt className="sr-only">GPS coordinates</dt>
                        <dd>
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open GPS coordinates ${coordinates} in OpenStreetMap`}
                            className="underline decoration-zinc-600 underline-offset-2 hover:text-zinc-200"
                          >
                            {coordinates}
                          </a>
                        </dd>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-start gap-2 border-t border-zinc-800 pt-2 text-zinc-400">
                      <ShieldCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <div className="min-w-0">
                        <dt className="sr-only">Verified by</dt>
                        <dd className="truncate font-medium text-zinc-200">{item.verifier.name}</dd>
                        <dd className="truncate text-[10px] text-zinc-500">{item.verifier.credential}</dd>
                      </div>
                    </div>
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}