import Image from "next/image";
import type { EventBrandingAssetDto } from "@/server/services/event-branding.service";

export function EventPoster({
  poster,
  variant = "display",
  className,
}: {
  poster: EventBrandingAssetDto;
  variant?: "thumbnail" | "display" | "banner";
  className?: string;
}) {
  const src = variant === "thumbnail" ? poster.thumbnailUrl : poster.displayUrl;
  const banner = variant === "banner";
  return <div className={`relative w-full overflow-hidden rounded-xl bg-brand-50 ${className ?? ""}`} style={{ aspectRatio: banner ? "16 / 6" : `${poster.width} / ${poster.height}` }}>
    <Image src={src} alt={poster.altText} fill sizes={variant === "thumbnail" ? "(max-width: 768px) 40vw, 240px" : banner ? "(max-width: 1024px) 100vw, 400px" : "(max-width: 768px) 100vw, 1200px"} className={banner ? "object-cover object-center" : "object-contain"} unoptimized loading="lazy" />
  </div>;
}
