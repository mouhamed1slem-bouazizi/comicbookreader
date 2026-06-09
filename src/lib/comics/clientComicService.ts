"use client";

import type { Comic } from "@/types/comic";

export async function getComicMetadata(comicId: string): Promise<Comic | null> {
  const res = await fetch(`/api/comics/${encodeURIComponent(comicId)}/meta`);
  if (!res.ok) return null;
  return res.json() as Promise<Comic>;
}

export async function fetchCatalogComics(
  token: string,
  tab: "shared" | "my_cloud" = "shared"
): Promise<Comic[]> {
  const res = await fetch(`/api/comics?tab=${tab}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { comics: Comic[] };
  return data.comics;
}
