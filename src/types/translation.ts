export interface TranslationRegion {
  bbox: [number, number, number, number];
  original: string;
  translated: string;
  confidence?: number;
}

export interface PageTranslation {
  comicId: string;
  pageIndex: number;
  pageKey: string;
  targetLang: string;
  regions: TranslationRegion[];
  model?: string;
  createdAt: string;
  version: number;
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
] as const;
