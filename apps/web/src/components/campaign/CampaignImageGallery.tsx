"use client";

import Image from "next/image";

type CampaignImage = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
};

type CampaignImageGalleryProps = {
  images: CampaignImage[];
};

/**
 * Campaign detail gallery.
 *
 * The first image is the visible campaign hero and is loaded eagerly. Every
 * subsequent image is below the initial viewport in the mobile layout and is
 * handed to Next's responsive lazy loader. Keeping the loading decision on the
 * image itself avoids the mobile-only jank caused by eagerly requesting the
 * entire gallery at once.
 */
export function CampaignImageGallery({ images }: CampaignImageGalleryProps) {
  if (images.length === 0) return null;

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3"
      data-testid="campaign-image-gallery"
    >
      {images.map((image, index) => {
        const isHero = index === 0;

        return (
          <figure
            className={isHero ? "relative col-span-2 aspect-[16/9] overflow-hidden rounded-xl md:col-span-3" : "relative aspect-square overflow-hidden rounded-xl"}
            key={`${image.src}-${index}`}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes={isHero ? "(max-width: 767px) 100vw, 100vw" : "(max-width: 767px) 50vw, 33vw"}
              className="object-cover"
              priority={isHero}
              loading={isHero ? "eager" : "lazy"}
              fetchPriority={isHero ? "high" : "auto"}
              decoding="async"
            />
          </figure>
        );
      })}
    </div>
  );
}

export default CampaignImageGallery;
