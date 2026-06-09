"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ComicReader } from "@/components/reader/ComicReader";
import { LocalComicReader } from "@/components/reader/LocalComicReader";
import { parseLocalComicId } from "@/lib/comics/comicServiceShared";
import { useAuth } from "@/lib/firebase/auth-context";
import { getProgress } from "@/lib/progress";
import type { Comic } from "@/types/comic";

interface ReaderPageClientProps {
  comicId: string;
}

export function ReaderPageClient({ comicId }: ReaderPageClientProps) {
  const { user, getIdToken } = useAuth();
  const router = useRouter();
  const [comic, setComic] = useState<Comic | null>(null);
  const [initialPage, setInitialPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const isLocal = parseLocalComicId(comicId);

  useEffect(() => {
    async function load() {
      if (isLocal) {
        setLoading(false);
        return;
      }

      try {
        const token = await getIdToken();
        const res = await fetch(`/api/comics/${encodeURIComponent(comicId)}/meta`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = (await res.json()) as Comic;
          setComic(data);
        }
      } catch {
        // fallback
      }

      if (user) {
        const progress = await getProgress(user.uid, comicId);
        if (progress) setInitialPage(progress.pageIndex);
      }
      setLoading(false);
    }
    void load();
  }, [comicId, isLocal, user, getIdToken]);

  if (loading && !isLocal) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  if (isLocal) {
    return <LocalComicReader comicId={comicId} />;
  }

  if (!comic) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-black text-white">
        <p>Comic not found</p>
        <button onClick={() => router.push("/library")} className="text-violet-400">
          Back to library
        </button>
      </div>
    );
  }

  return (
    <ComicReader
      comicId={comic.id}
      title={comic.title}
      totalPages={comic.totalPages}
      initialPage={initialPage}
      sourceRef={comic.source}
      coverUrl={comic.coverUrl}
    />
  );
}
