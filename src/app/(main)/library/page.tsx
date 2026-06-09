"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Search, RefreshCw } from "lucide-react";
import { ComicCard } from "@/components/library/ComicCard";
import { ResponsiveGrid } from "@/components/layout/ResponsiveGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/firebase/auth-context";
import { fetchCatalogComics } from "@/lib/comics/clientComicService";
import {
  listLocalComics,
  saveLocalComic,
  localComicIdFromFile,
  formatFromFilename,
} from "@/lib/comics/localStore";
import { listComicPages, hashBuffer } from "@/lib/comics/extractPage";
import type { Comic } from "@/types/comic";
import type { LocalComicMeta } from "@/types/comic";
import { getProgressList } from "@/lib/progress";

type Tab = "terabox" | "local" | "shared";

export default function LibraryPage() {
  const { user, getIdToken } = useAuth();
  const [tab, setTab] = useState<Tab>("terabox");
  const [catalogComics, setCatalogComics] = useState<Comic[]>([]);
  const [localComics, setLocalComics] = useState<LocalComicMeta[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const locals = await listLocalComics();
    setLocalComics(locals);

    if (user) {
      const progress = await getProgressList(user.uid);
      const map: Record<string, number> = {};
      for (const p of progress) map[p.comicId] = p.pageIndex;
      setProgressMap(map);
    }

    const token = await getIdToken();
    if (token && tab === "terabox") {
      const comics = await fetchCatalogComics(token, "terabox");
      setCatalogComics(comics.filter((c) => c.source.provider === "terabox"));
    } else if (token && tab === "shared") {
      const comics = await fetchCatalogComics(token, "shared");
      setCatalogComics(comics);
    } else {
      setCatalogComics([]);
    }
    setLoading(false);
  }, [user, getIdToken, tab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const format = formatFromFilename(file.name);
    if (!format) {
      alert("Only CBZ and CBR files are supported.");
      return;
    }

    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const pages = await listComicPages(buffer, format);
      const hash = await hashBuffer(buffer);
      const id = localComicIdFromFile(file.name, hash);
      const meta: LocalComicMeta = {
        id,
        title: file.name.replace(/\.(cbz|cbr)$/i, ""),
        format,
        totalPages: pages.length,
        addedAt: new Date().toISOString(),
      };
      await saveLocalComic(id, meta, buffer);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const filteredCatalog = catalogComics.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );
  const filteredLocal = localComics.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">Library</h1>
          <p className="text-sm text-zinc-500">Browse and read your comic collection</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".cbz,.cbr"
            className="hidden"
            onChange={(e) => void handleUpload(e)}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading..." : "Upload CBZ/CBR"}
          </Button>
          <Button variant="outline" onClick={() => void loadData()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
          {(["terabox", "local", "shared"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                tab === t ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {t === "terabox" ? "Terabox" : t}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            placeholder="Search comics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : tab === "local" ? (
        filteredLocal.length === 0 ? (
          <EmptyState message="No local comics yet. Upload a CBZ or CBR file to get started." />
        ) : (
          <ResponsiveGrid>
            {filteredLocal.map((comic) => (
              <ComicCard
                key={comic.id}
                id={comic.id}
                title={comic.title}
                totalPages={comic.totalPages}
                pageIndex={progressMap[comic.id]}
                badge="Local"
                source="local"
              />
            ))}
          </ResponsiveGrid>
        )
      ) : filteredCatalog.length === 0 ? (
        <EmptyState
          message={
            tab === "terabox"
              ? "No Terabox comics yet. Go to Settings, connect Terabox with your ndus cookie, and index your /Comics folder."
              : tab === "shared"
              ? "No shared comics indexed yet. Admin can index Terabox from Admin → Catalog."
              : "Connect Terabox in Settings to see your cloud comics."
          }
        />
      ) : (
        <ResponsiveGrid>
          {filteredCatalog.map((comic) => (
            <ComicCard
              key={comic.id}
              id={comic.id}
              title={comic.title}
              coverUrl={comic.coverUrl}
              totalPages={comic.totalPages}
              pageIndex={progressMap[comic.id]}
              source={comic.source.provider}
            />
          ))}
        </ResponsiveGrid>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700 py-16 text-center">
      <p className="text-zinc-500">{message}</p>
    </div>
  );
}
