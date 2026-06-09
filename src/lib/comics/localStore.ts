"use client";

import type { ComicFormat, LocalComicMeta } from "@/types/comic";

const DB_NAME = "comicreader";
const DB_VERSION = 1;
const COMICS_STORE = "comics";
const FILES_STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COMICS_STORE)) {
        db.createObjectStore(COMICS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveLocalComic(
  id: string,
  meta: LocalComicMeta,
  buffer: ArrayBuffer
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([COMICS_STORE, FILES_STORE], "readwrite");
    tx.objectStore(COMICS_STORE).put(meta);
    tx.objectStore(FILES_STORE).put({ id, buffer });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listLocalComics(): Promise<LocalComicMeta[]> {
  const db = await openDb();
  const comics = await new Promise<LocalComicMeta[]>((resolve, reject) => {
    const tx = db.transaction(COMICS_STORE, "readonly");
    const request = tx.objectStore(COMICS_STORE).getAll();
    request.onsuccess = () => resolve(request.result as LocalComicMeta[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return comics.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function getLocalComicBuffer(id: string): Promise<ArrayBuffer | null> {
  const db = await openDb();
  const record = await new Promise<{ buffer: ArrayBuffer } | undefined>((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly");
    const request = tx.objectStore(FILES_STORE).get(id);
    request.onsuccess = () => resolve(request.result as { buffer: ArrayBuffer } | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record?.buffer ?? null;
}

export async function getLocalComicMeta(id: string): Promise<LocalComicMeta | null> {
  const db = await openDb();
  const meta = await new Promise<LocalComicMeta | undefined>((resolve, reject) => {
    const tx = db.transaction(COMICS_STORE, "readonly");
    const request = tx.objectStore(COMICS_STORE).get(id);
    request.onsuccess = () => resolve(request.result as LocalComicMeta | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return meta ?? null;
}

export async function deleteLocalComic(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([COMICS_STORE, FILES_STORE], "readwrite");
    tx.objectStore(COMICS_STORE).delete(id);
    tx.objectStore(FILES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function localComicIdFromFile(name: string, hash: string): string {
  return `local-${hash.slice(0, 12)}-${name.replace(/\.[^.]+$/, "").slice(0, 20).replace(/[^a-z0-9]/gi, "")}`;
}

export function formatFromFilename(name: string): ComicFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".cbz")) return "cbz";
  if (lower.endsWith(".cbr")) return "cbr";
  return null;
}
