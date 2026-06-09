"use client";

import Image from "next/image";
import type { TranslationRegion } from "@/types/translation";
import { TranslationOverlay } from "./TranslationOverlay";

interface ComicPageProps {
  src: string;
  alt: string;
  regions?: TranslationRegion[];
  showTranslation?: boolean;
  fontSize?: number;
}

export function ComicPage({
  src,
  alt,
  regions = [],
  showTranslation = false,
  fontSize,
}: ComicPageProps) {
  return (
    <div className="relative mx-auto flex h-full w-full max-w-4xl items-center justify-center">
      <div className="relative h-full w-full">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain"
          priority
          unoptimized
          sizes="100vw"
        />
        <TranslationOverlay
          regions={regions}
          visible={showTranslation}
          fontSize={fontSize}
        />
      </div>
    </div>
  );
}
