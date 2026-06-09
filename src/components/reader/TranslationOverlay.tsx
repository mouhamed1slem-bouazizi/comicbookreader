"use client";

import type { TranslationRegion } from "@/types/translation";

interface TranslationOverlayProps {
  regions: TranslationRegion[];
  visible: boolean;
  fontSize?: number;
}

export function TranslationOverlay({
  regions,
  visible,
  fontSize = 14,
}: TranslationOverlayProps) {
  if (!visible || regions.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {regions.map((region, i) => {
        const [x, y, w, h] = region.bbox;
        return (
          <div
            key={i}
            className="absolute flex items-center justify-center overflow-hidden rounded bg-black/75 p-1 text-center leading-tight text-white backdrop-blur-sm"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: `${w}%`,
              height: `${h}%`,
              fontSize: `${fontSize}px`,
            }}
          >
            {region.translated}
          </div>
        );
      })}
    </div>
  );
}
