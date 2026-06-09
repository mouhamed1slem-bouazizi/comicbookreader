"use client";

import type { Comic } from "@/types/comic";

export async function getComicMetadata(
  comicId: string,
  token?: string | null
): Promise<Comic | null> {
  const res = await fetch(`/api/comics/${encodeURIComponent(comicId)}/meta`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  return res.json() as Promise<Comic>;
}

export async function fetchCatalogComics(
  token: string,
  tab: "shared" | "my_cloud" | "terabox" = "shared"
): Promise<Comic[]> {
  const queryTab = tab === "terabox" ? "terabox" : tab;
  const res = await fetch(`/api/comics?tab=${queryTab}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (tab === "terabox" || tab === "my_cloud") {
      return fetchTeraboxBrowse(token);
    }
    return [];
  }
  const data = (await res.json()) as { comics: Comic[]; error?: string };
  return data.comics ?? [];
}

export async function fetchTeraboxBrowse(token: string): Promise<Comic[]> {
  const res = await fetch("/api/cloud/terabox/browse", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { comics: Comic[] };
  return data.comics ?? [];
}
