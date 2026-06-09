import type { ComicFormat } from "@/types/comic";
import { extractCbzPage, listCbzPages } from "./cbz";
import { extractCbrPage, listCbrPages } from "./cbr";

export function detectFormat(filename: string): ComicFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".cbz")) return "cbz";
  if (lower.endsWith(".cbr")) return "cbr";
  return null;
}

export async function listComicPages(
  buffer: ArrayBuffer,
  format: ComicFormat
): Promise<string[]> {
  if (format === "cbz") return listCbzPages(buffer);
  return listCbrPages(buffer);
}

export async function extractComicPage(
  buffer: ArrayBuffer,
  format: ComicFormat,
  pageIndex: number
): Promise<{ data: Uint8Array; mimeType: string; name: string } | null> {
  if (format === "cbz") return extractCbzPage(buffer, pageIndex);
  return extractCbrPage(buffer, pageIndex);
}

export async function hashBuffer(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPageData(data: Uint8Array): Promise<string> {
  const copy = data.slice().buffer;
  return hashBuffer(copy as ArrayBuffer);
}
