import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { getAdminDriveClient, getUserDriveClient, downloadDriveFile } from "@/lib/cloud/googleDrive";
import {
  getAdminTeraboxCredentials,
  getUserTeraboxCredentials,
  downloadTeraboxFile,
} from "@/lib/cloud/terabox";
import { decryptToken } from "@/lib/cloud/encryption";
import type { Comic, ComicFormat } from "@/types/comic";

const bufferCache = new Map<string, { buffer: ArrayBuffer; expires: number }>();
const CACHE_TTL = 30 * 60 * 1000;

function cacheKey(comicId: string) {
  return comicId;
}

export async function getComicMetadata(comicId: string): Promise<Comic | null> {
  if (comicId.startsWith("local-")) {
    return null;
  }
  if (!isFirebaseAdminConfigured()) return null;
  const doc = await getAdminDb()
    .collection("catalog")
    .doc("comics")
    .collection("items")
    .doc(comicId)
    .get();
  if (!doc.exists) return null;
  return doc.data() as Comic;
}

export async function getComicBuffer(comicId: string, localBuffer?: ArrayBuffer): Promise<ArrayBuffer | null> {
  if (localBuffer) return localBuffer;

  const cached = bufferCache.get(cacheKey(comicId));
  if (cached && cached.expires > Date.now()) {
    return cached.buffer;
  }

  const meta = await getComicMetadata(comicId);
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
    const creds = source.userId
      ? await getUserTeraboxCredentials(source.userId)
      : getAdminTeraboxCredentials();
    if (!creds) return null;
    buffer = await downloadTeraboxFile(creds, source.fileId);
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
}

export async function getCoverData(comicId: string): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!isFirebaseAdminConfigured()) return null;
  const doc = await getAdminDb().collection("catalog_covers").doc(comicId).get();
  if (!doc.exists) return null;
  const { data, mimeType } = doc.data() as { data: string; mimeType: string };
  return { data: Buffer.from(data, "base64"), mimeType };
}

export type { ComicFormat };
