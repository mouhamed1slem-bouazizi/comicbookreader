"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Languages,
  Maximize,
  Minimize,
  CheckCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComicPage } from "@/components/reader/ComicPage";
import { useAuth } from "@/lib/firebase/auth-context";
import { saveProgress, markCompleted } from "@/lib/progress";
import {
  getLocalComicMeta,
  getLocalComicBuffer,
} from "@/lib/comics/localStore";
import { extractComicPage } from "@/lib/comics/extractPage";
import type { TranslationRegion } from "@/types/translation";
import { cn } from "@/lib/utils";

interface LocalComicReaderProps {
  comicId: string;
}

export function LocalComicReader({ comicId }: LocalComicReaderProps) {
  const { user, settings, getIdToken } = useAuth();
  const [title, setTitle] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageUrl, setPageUrl] = useState<string>("");
  const [showTranslation, setShowTranslation] = useState(settings.translationEnabled);
  const [regions, setRegions] = useState<TranslationRegion[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const formatRef = useRef<"cbz" | "cbr">("cbz");
  const touchStartX = useRef<number | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const sourceRef = useMemo(
    () => ({ provider: "local" as const }),
    []
  );

  useEffect(() => {
    async function init() {
      const meta = await getLocalComicMeta(comicId);
      const buffer = await getLocalComicBuffer(comicId);
      if (!meta || !buffer) {
        setLoading(false);
        return;
      }
      bufferRef.current = buffer;
      formatRef.current = meta.format;
      setTitle(meta.title);
      setTotalPages(meta.totalPages);

      if (user) {
        const { getProgress } = await import("@/lib/progress");
        const progress = await getProgress(user.uid, comicId);
        if (progress) setPageIndex(progress.pageIndex);
      }
      setLoading(false);
    }
    void init();
  }, [comicId, user]);

  const loadPage = useCallback(async (index: number) => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const page = await extractComicPage(buffer, formatRef.current, index);
    if (!page) return;

    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    const blob = new Blob([page.data.buffer as ArrayBuffer], { type: page.mimeType });
    const url = URL.createObjectURL(blob);
    blobUrlRef.current = url;
    setPageUrl(url);
  }, []);

  useEffect(() => {
    if (!loading && totalPages > 0) {
      void loadPage(pageIndex);
    }
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [pageIndex, loading, totalPages, loadPage]);

  useEffect(() => {
    if (!user || loading) return;
    void saveProgress(user.uid, {
      comicId,
      title,
      pageIndex,
      totalPages,
      sourceRef,
    });
  }, [user, comicId, title, pageIndex, totalPages, sourceRef, loading]);

  useEffect(() => {
    if (!settings.translationEnabled || !showTranslation || !pageUrl) {
      setRegions([]);
      return;
    }
    void (async () => {
      const buffer = bufferRef.current;
      if (!buffer) return;
      const page = await extractComicPage(buffer, formatRef.current, pageIndex);
      if (!page) return;

      const token = await getIdToken();
      const base64 = btoa(
        new Uint8Array(page.data).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      const res = await fetch("/api/translate/local", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify({
          comicId,
          pageIndex,
          targetLang: settings.targetLang,
          imageBase64: base64,
          mimeType: page.mimeType,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { regions: TranslationRegion[] };
        setRegions(data.regions);
      }
    })();
  }, [pageIndex, settings, showTranslation, comicId, getIdToken, pageUrl]);

  const goTo = (index: number) => {
    setPageIndex(Math.max(0, Math.min(totalPages - 1, index)));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  if (!bufferRef.current) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p>Local comic not found</p>
        <Link href="/library" className="text-violet-400">Back to library</Link>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("flex h-screen flex-col bg-black text-white", fullscreen && "fixed inset-0 z-50")}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const diff = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(diff) > 50) goTo(diff > 0 ? pageIndex - 1 : pageIndex + 1);
        touchStartX.current = null;
      }}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Link href="/library"><Button variant="ghost" size="icon"><X className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="truncate text-sm font-medium">{title}</h1>
            <p className="text-xs text-zinc-500">Page {pageIndex + 1} / {totalPages}</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant={showTranslation ? "default" : "ghost"} size="icon" onClick={() => setShowTranslation((s) => !s)}>
            <Languages className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => {
            if (!document.fullscreenElement) void containerRef.current?.requestFullscreen();
            else void document.exitFullscreen();
            setFullscreen((f) => !f);
          }}>
            {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 p-2">
        {pageUrl && (
          <ComicPage
            src={pageUrl}
            alt={`${title} page ${pageIndex + 1}`}
            regions={regions}
            showTranslation={showTranslation}
            fontSize={settings.overlayFontSize}
          />
        )}
      </div>

      <footer className="shrink-0 border-t border-zinc-800 px-3 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => goTo(pageIndex - 1)} disabled={pageIndex === 0}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <input type="range" min={0} max={totalPages - 1} value={pageIndex} onChange={(e) => goTo(Number(e.target.value))} className="flex-1 accent-violet-500" />
          <Button variant="ghost" size="icon" onClick={() => goTo(pageIndex + 1)} disabled={pageIndex >= totalPages - 1}>
            <ChevronRight className="h-5 w-5" />
          </Button>
          {pageIndex >= totalPages - 1 && user && (
            <Button variant="secondary" size="sm" onClick={() => void markCompleted(user.uid, { comicId, title, lastPageIndex: pageIndex, sourceRef })}>
              <CheckCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
