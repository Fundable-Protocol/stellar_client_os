"use client";

import Image from "next/image";

export type CampaignImage = {
  src: string;
  alt: string;
};

type CampaignImageGalleryProps = {
  images: CampaignImage[];
};

/**
 * Renders campaign detail images without requesting the whole gallery during
 * the initial mobile render. The first image is the above-the-fold hero;
 * every following image is below the fold and uses the browser's native lazy
 * loading path.
 */
export function CampaignImageGallery({ images }: CampaignImageGalleryProps) {
  if (images.length === 0) return null;

  return (
    <section aria-label="Campaign images" data-testid="campaign-image-gallery">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {images.map((image, index) => {
          const isHero = index === 0;

          return (
            <figure
              className={
                isHero
                  ? "relative col-span-2 aspect-[16/9] overflow-hidden rounded-xl md:col-span-3"
                  : "relative aspect-square overflow-hidden rounded-xl"
              }
              key={`${image.src}-${index}`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes={
                  isHero
                    ? "(max-width: 767px) 100vw, 100vw"
                    : "(max-width: 767px) 50vw, 33vw"
                }
                className="object-cover"
                priority={isHero}
                loading={isHero ? "eager" : "lazy"}
                fetchPriority={isHero ? "high" : "auto"}
                decoding="async"
                unoptimized
              />
            </figure>
          );
        })}
      </div>
    </section>
  );
}

export default CampaignImageGallery;
