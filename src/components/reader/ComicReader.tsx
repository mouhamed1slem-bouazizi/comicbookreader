"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Languages,
  Maximize,
  Minimize,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComicPage } from "@/components/reader/ComicPage";
import { useAuth } from "@/lib/firebase/auth-context";
import { saveProgress, markCompleted } from "@/lib/progress";
import type { ComicSourceRef } from "@/types/comic";
import type { TranslationRegion } from "@/types/translation";
import { cn } from "@/lib/utils";

interface ComicReaderProps {
  comicId: string;
  title: string;
  totalPages: number;
  initialPage?: number;
  sourceRef: ComicSourceRef;
  coverUrl?: string;
}

function useTranslationPrefetch(
  comicId: string,
  currentPage: number,
  totalPages: number,
  enabled: boolean,
  targetLang: string,
  getIdToken: () => Promise<string | null>
) {
  const cacheRef = useRef<Map<number, TranslationRegion[]>>(new Map());
  const failedRef = useRef<Set<number>>(new Set());
  const [regions, setRegions] = useState<TranslationRegion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTranslation = useCallback(
    async (pageIndex: number) => {
      if (cacheRef.current.has(pageIndex)) {
        if (pageIndex === currentPage) {
          setRegions(cacheRef.current.get(pageIndex) ?? []);
        }
        return;
      }
      if (failedRef.current.has(pageIndex)) return;

      const token = await getIdToken();
      if (!token) return;

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ comicId, pageIndex, targetLang }),
        });
        if (!res.ok) {
          failedRef.current.add(pageIndex);
          return;
        }
        const data = (await res.json()) as { regions: TranslationRegion[] };
        cacheRef.current.set(pageIndex, data.regions);
        if (pageIndex === currentPage) {
          setRegions(data.regions);
        }
      } catch {
        failedRef.current.add(pageIndex);
      }
    },
    [comicId, currentPage, targetLang, getIdToken]
  );

  useEffect(() => {
    if (!enabled) {
      setRegions([]);
      return;
    }
    failedRef.current.delete(currentPage);
    setLoading(true);
    void fetchTranslation(currentPage).finally(() => setLoading(false));

    const prefetch = [currentPage + 1, currentPage + 2].filter((p) => p < totalPages);
    for (const p of prefetch) {
      void fetchTranslation(p);
    }
  }, [currentPage, enabled, totalPages, fetchTranslation]);

  return { regions, loading };
}

export function ComicReader({
  comicId,
  title,
  totalPages,
  initialPage = 0,
  sourceRef,
  coverUrl,
}: ComicReaderProps) {
  const { user, settings, getIdToken } = useAuth();
  const [pageIndex, setPageIndex] = useState(initialPage);
  const [pageUrl, setPageUrl] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [resolvedTotalPages, setResolvedTotalPages] = useState(totalPages);
  const blobUrlRef = useRef<string | null>(null);

  const [showTranslation, setShowTranslation] = useState(settings.translationEnabled);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setResolvedTotalPages(totalPages);
  }, [totalPages]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setPageLoading(true);
      const token = await getIdToken();
      const res = await fetch(
        `/api/comics/${encodeURIComponent(comicId)}/pages/${pageIndex}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      if (cancelled) return;

      if (!res.ok) {
        setPageUrl("");
        setPageLoading(false);
        return;
      }

      const totalHeader = res.headers.get("X-Comic-Total-Pages");
      if (totalHeader) {
        const parsed = parseInt(totalHeader, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          setResolvedTotalPages(parsed);
        }
      }

      const blob = await res.blob();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setPageUrl(url);
      setPageLoading(false);
    }

    void loadPage();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [comicId, pageIndex, getIdToken]);

  useEffect(() => {
    if (resolvedTotalPages > 0) return;
    void (async () => {
      const token = await getIdToken();
      const res = await fetch(`/api/comics/${encodeURIComponent(comicId)}/meta`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as { totalPages: number };
        if (data.totalPages > 0) setResolvedTotalPages(data.totalPages);
      }
    })();
  }, [comicId, resolvedTotalPages, getIdToken]);

  const translationEnabled =
    Boolean(pageUrl) &&
    settings.translationEnabled &&
    showTranslation &&
    (!settings.wifiOnlyTranslation ||
      (typeof navigator !== "undefined" &&
        !(navigator as Navigator & { connection?: { type?: string } }).connection?.type?.includes("cellular")));

  const effectiveTotalPages =
    resolvedTotalPages > 0 ? resolvedTotalPages : totalPages > 0 ? totalPages : 0;

  const { regions } = useTranslationPrefetch(
    comicId,
    pageIndex,
    effectiveTotalPages,
    translationEnabled,
    settings.targetLang,
    getIdToken
  );

  const persistProgress = useCallback(
    async (index: number) => {
      if (!user) return;
      try {
        await saveProgress(user.uid, {
          comicId,
          title,
          pageIndex: index,
          totalPages: effectiveTotalPages > 0 ? effectiveTotalPages : Math.max(index + 1, 1),
          sourceRef,
          ...(coverUrl ? { coverUrl } : {}),
        });
      } catch (err) {
        console.error("Failed to save reading progress:", err);
      }
    },
    [user, comicId, title, effectiveTotalPages, sourceRef, coverUrl]
  );

  useEffect(() => {
    void persistProgress(pageIndex);
  }, [pageIndex, persistProgress]);

  const goTo = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(effectiveTotalPages - 1, index));
      setPageIndex(next);
    },
    [effectiveTotalPages]
  );

  const handleComplete = async () => {
    if (!user) return;
    try {
      await markCompleted(user.uid, {
        comicId,
        title,
        lastPageIndex: pageIndex,
        sourceRef,
        ...(coverUrl ? { coverUrl } : {}),
      });
    } catch (err) {
      console.error("Failed to mark comic completed:", err);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goTo(pageIndex + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(pageIndex - 1);
      } else if (e.key === "f" || e.key === "F") {
        setFullscreen((f) => !f);
      } else if (e.key === "t" || e.key === "T") {
        setShowTranslation((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageIndex, goTo]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      if (settings.readingDirection === "rtl") {
        goTo(diff > 0 ? pageIndex + 1 : pageIndex - 1);
      } else {
        goTo(diff > 0 ? pageIndex - 1 : pageIndex + 1);
      }
    }
    touchStartX.current = null;
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void containerRef.current?.requestFullscreen();
      setFullscreen(true);
    } else {
      void document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-screen flex-col bg-black text-white",
        fullscreen && "fixed inset-0 z-50"
      )}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2 lg:px-4">
        <div className="flex items-center gap-2">
          <Link href="/library">
            <Button variant="ghost" size="icon" aria-label="Back">
              <X className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium lg:text-base">{title}</h1>
            <p className="text-xs text-zinc-500">
              Page {pageIndex + 1} / {effectiveTotalPages > 0 ? effectiveTotalPages : "…"}
              {pageLoading ? " · loading..." : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={showTranslation ? "default" : "ghost"}
            size="icon"
            onClick={() => setShowTranslation((s) => !s)}
            aria-label="Toggle translation"
            className="hidden sm:flex"
          >
            <Languages className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen((s) => !s)}
            className="hidden lg:flex"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label="Fullscreen">
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="hidden w-48 shrink-0 overflow-y-auto border-r border-zinc-800 p-2 lg:block xl:w-56">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              {Array.from({ length: Math.min(effectiveTotalPages, 50) }, (_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={cn(
                    "rounded border px-2 py-1 text-xs transition-colors",
                    i === pageIndex
                      ? "border-violet-500 bg-violet-500/20 text-violet-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  )}
                >
                  {i + 1}
                </button>
              ))}
              {effectiveTotalPages > 50 && (
                <p className="col-span-2 text-xs text-zinc-600">+{effectiveTotalPages - 50} more pages</p>
              )}
            </div>
          </aside>
        )}

        <div className="relative min-h-0 flex-1">
          <div
            className="absolute inset-y-0 left-0 z-10 w-1/4 cursor-pointer lg:w-1/5"
            onClick={() => goTo(settings.readingDirection === "rtl" ? pageIndex + 1 : pageIndex - 1)}
            aria-label="Previous page"
          />
          <div
            className="absolute inset-y-0 right-0 z-10 w-1/4 cursor-pointer lg:w-1/5"
            onClick={() => goTo(settings.readingDirection === "rtl" ? pageIndex - 1 : pageIndex + 1)}
            aria-label="Next page"
          />

          <div className="relative h-full p-2 md:p-4">
            {pageUrl ? (
              <ComicPage
                src={pageUrl}
                alt={`${title} page ${pageIndex + 1}`}
                regions={regions}
                showTranslation={translationEnabled}
                fontSize={settings.overlayFontSize}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-500">
                {pageLoading ? "Loading page..." : "Could not load page. Reconnect Terabox in Settings."}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-800 px-3 py-3 lg:px-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo(pageIndex - 1)}
            disabled={pageIndex === 0}
            aria-label="Previous"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <input
            type="range"
            min={0}
            max={Math.max(effectiveTotalPages - 1, 0)}
            value={pageIndex}
            onChange={(e) => goTo(Number(e.target.value))}
            className="min-w-0 flex-1 accent-violet-500"
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => goTo(pageIndex + 1)}
            disabled={effectiveTotalPages > 0 && pageIndex >= effectiveTotalPages - 1}
            aria-label="Next"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>

          <Button
            variant={showTranslation ? "default" : "ghost"}
            size="icon"
            onClick={() => setShowTranslation((s) => !s)}
            className="sm:hidden"
            aria-label="Toggle translation"
          >
            <Languages className="h-4 w-4" />
          </Button>

          {effectiveTotalPages > 0 && pageIndex >= effectiveTotalPages - 1 && (
            <Button variant="secondary" size="sm" onClick={() => void handleComplete()}>
              <CheckCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Finish</span>
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
