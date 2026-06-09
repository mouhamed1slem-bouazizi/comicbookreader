import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { getAdminDriveClient, getUserDriveClient, downloadDriveFile } from "@/lib/cloud/googleDrive";
import {
  getAdminTeraboxCredentials,
  getUserTeraboxCredentials,
  downloadTeraboxFile,
  resolveTeraboxComic,
} from "@/lib/cloud/terabox";
import { decryptToken } from "@/lib/cloud/encryption";
import type { Comic, ComicFormat } from "@/types/comic";
import { listComicPages } from "@/lib/comics/extractPage";

const bufferCache = new Map<string, { buffer: ArrayBuffer; expires: number }>();
const pageCountCache = new Map<string, number>();
const CACHE_TTL = 30 * 60 * 1000;

function cacheKey(comicId: string) {
  return comicId;
}

export async function getComicMetadata(
  comicId: string,
  uid?: string
): Promise<Comic | null> {
  if (comicId.startsWith("local-")) {
    return null;
  }

  if (comicId.startsWith("terabox-") && uid) {
    try {
      const resolved = await resolveTeraboxComic(comicId, uid);
      if (resolved) {
        const cachedPages = pageCountCache.get(comicId);
        if (cachedPages) resolved.totalPages = cachedPages;
        return resolved;
      }
    } catch (err) {
      console.error("getComicMetadata terabox resolve error:", err);
    }
  }

  if (!isFirebaseAdminConfigured()) return null;

  try {
    const doc = await getAdminDb()
      .collection("catalog")
      .doc("comics")
      .collection("items")
      .doc(comicId)
      .get();
    if (!doc.exists) return null;
    const comic = doc.data() as Comic;
    const cachedPages = pageCountCache.get(comicId);
    if (cachedPages && comic.totalPages === 0) {
      comic.totalPages = cachedPages;
    }
    return comic;
  } catch (err) {
    console.error("getComicMetadata error:", err);
    return null;
  }
}

export async function ensureComicPageCount(comic: Comic, uid?: string): Promise<number> {
  if (comic.totalPages > 0) return comic.totalPages;

  const cached = pageCountCache.get(comic.id);
  if (cached) return cached;

  try {
    const buffer = await getComicBuffer(comic.id, undefined, comic, uid);
    if (!buffer) return 0;

    const pages = await listComicPages(buffer, comic.format);
    pageCountCache.set(comic.id, pages.length);

    if (isFirebaseAdminConfigured() && pages.length > 0) {
      try {
        await getAdminDb()
          .collection("catalog")
          .doc("comics")
          .collection("items")
          .doc(comic.id)
          .set({ totalPages: pages.length }, { merge: true });
      } catch {
        // non-fatal
      }
    }

    return pages.length;
  } catch (err) {
    console.error("ensureComicPageCount error:", err);
    return 0;
  }
}

export async function getComicBuffer(
  comicId: string,
  localBuffer?: ArrayBuffer,
  metaOverride?: Comic,
  uid?: string
): Promise<ArrayBuffer | null> {
  if (localBuffer) return localBuffer;

  const cached = bufferCache.get(cacheKey(comicId));
  if (cached && cached.expires > Date.now()) {
    return cached.buffer;
  }

  const meta = metaOverride ?? (await getComicMetadata(comicId));
  if (!meta) return null;

  let buffer: ArrayBuffer | null = null;
  const source = meta.source;

  if (source.provider === "catalog" || source.provider === "google_drive") {
    if (!source.fileId) return null;
    try {
      let drive;
      if (source.userId) {
        const connDoc = await getAdminDb()
          .collection("users")
          .doc(source.userId)
          .collection("connections")
          .doc("google_drive")
          .get();
        const refreshToken = connDoc.data()?.encryptedRefreshToken
          ? decryptToken(connDoc.data()!.encryptedRefreshToken as string)
          : null;
        if (!refreshToken) return null;
        drive = getUserDriveClient(refreshToken);
      } else {
        drive = getAdminDriveClient();
      }
      buffer = await downloadDriveFile(drive, source.fileId);
    } catch (err) {
      console.error("Drive download error:", err);
    }
  } else if (source.provider === "terabox") {
    if (!source.fileId) return null;
    const credUserId = uid ?? source.userId;
    const creds = credUserId
      ? await getUserTeraboxCredentials(credUserId)
      : getAdminTeraboxCredentials();
    if (!creds) return null;
    buffer = await downloadTeraboxFile(creds, source.fileId, source.path, credUserId);
  }

  if (buffer) {
    bufferCache.set(cacheKey(comicId), { buffer, expires: Date.now() + CACHE_TTL });
  }
  return buffer;
}

export function parseLocalComicId(comicId: string): boolean {
  return comicId.startsWith("local-");
}

export async function listAllCatalogComics(userId?: string): Promise<Comic[]> {
  if (!isFirebaseAdminConfigured()) return [];

  try {
    const db = getAdminDb();
    const snap = await db.collection("catalog").doc("comics").collection("items").get();
    let comics = snap.docs.map((d) => d.data() as Comic);

    if (userId) {
      comics = comics.filter(
        (c) => !c.source.userId || c.source.userId === userId || c.source.provider === "catalog"
      );
    } else {
      comics = comics.filter((c) => c.source.provider === "catalog" || !c.source.userId);
    }

    return comics.sort((a, b) => (b.indexedAt ?? "").localeCompare(a.indexedAt ?? ""));
  } catch (err) {
    console.error("listAllCatalogComics error:", err);
    return [];
  }
}

export async function getCoverData(comicId: string): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!isFirebaseAdminConfigured()) return null;
  try {
    const doc = await getAdminDb().collection("catalog_covers").doc(comicId).get();
    if (!doc.exists) return null;
    const { data, mimeType } = doc.data() as { data: string; mimeType: string };
    return { data: Buffer.from(data, "base64"), mimeType };
  } catch {
    return null;
  }
}

export type { ComicFormat };
