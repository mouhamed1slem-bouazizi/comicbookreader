export type ComicFormat = "cbz" | "cbr";
export type ComicSource = "local" | "google_drive" | "terabox" | "catalog";

export interface ComicSourceRef {
  provider: ComicSource;
  fileId?: string;
  path?: string;
  sizeBytes?: number;
  userId?: string;
}

export interface Comic {
  id: string;
  title: string;
  coverUrl?: string;
  totalPages: number;
  format: ComicFormat;
  source: ComicSourceRef;
  indexedAt?: string;
  tags?: string[];
  languageHint?: string;
}

export interface ReadingProgress {
  comicId: string;
  title: string;
  pageIndex: number;
  totalPages: number;
  percent: number;
  updatedAt: string;
  sourceRef: ComicSourceRef;
  coverUrl?: string;
}

export interface CompletedComic {
  comicId: string;
  title: string;
  completedAt: string;
  lastPageIndex: number;
  coverUrl?: string;
  sourceRef: ComicSourceRef;
}

export interface LocalComicMeta {
  id: string;
  title: string;
  format: ComicFormat;
  totalPages: number;
  addedAt: string;
}
