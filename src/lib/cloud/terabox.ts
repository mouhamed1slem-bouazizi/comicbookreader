import type { Comic, ComicFormat } from "@/types/comic";
import { getAdminDb } from "@/lib/firebase/admin";
import { encryptToken, decryptToken } from "./encryption";

export interface TeraboxCredentials {
  ndus: string;
  jsToken: string;
  appId: string;
  bdstoken?: string;
}

export interface TeraboxFile {
  fs_id: string;
  server_filename: string;
  path: string;
  size: number;
}

const TERABOX_API = "https://www.terabox.com/api";

async function teraboxRequest(
  creds: TeraboxCredentials,
  endpoint: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const url = new URL(`${TERABOX_API}/${endpoint}`);
  url.searchParams.set("app_id", creds.appId);
  url.searchParams.set("jsToken", creds.jsToken);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Cookie: `ndus=${creds.ndus}`,
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) throw new Error(`Terabox API error: ${res.status}`);
  return res.json();
}

export function getAdminTeraboxCredentials(): TeraboxCredentials | null {
  const ndus = process.env.TERABOX_NDUS;
  const jsToken = process.env.TERABOX_JS_TOKEN;
  const appId = process.env.TERABOX_APP_ID ?? "250528";
  if (!ndus || !jsToken) return null;
  return { ndus, jsToken, appId };
}

export async function getUserTeraboxCredentials(uid: string): Promise<TeraboxCredentials | null> {
  const doc = await getAdminDb()
    .collection("users")
    .doc(uid)
    .collection("connections")
    .doc("terabox")
    .get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data?.encryptedCredentials) return null;
  try {
    return JSON.parse(decryptToken(data.encryptedCredentials as string)) as TeraboxCredentials;
  } catch {
    return null;
  }
}

export async function saveTeraboxCredentials(
  uid: string,
  creds: TeraboxCredentials
): Promise<void> {
  await getAdminDb()
    .collection("users")
    .doc(uid)
    .collection("connections")
    .doc("terabox")
    .set({
      provider: "terabox",
      encryptedCredentials: encryptToken(JSON.stringify(creds)),
      status: "connected",
      connectedAt: new Date().toISOString(),
      lastSyncAt: new Date().toISOString(),
    });
}

export async function listTeraboxFiles(
  creds: TeraboxCredentials,
  dir = "/"
): Promise<TeraboxFile[]> {
  try {
    const data = (await teraboxRequest(creds, "list", {
      dir,
      order: "time",
      desc: "1",
      page: "1",
      num: "200",
    })) as { list?: Array<{ fs_id: number; server_filename: string; path: string; size: number; isdir: number }> };

    const files: TeraboxFile[] = [];
    for (const item of data.list ?? []) {
      if (item.isdir) {
        const nested = await listTeraboxFiles(creds, item.path);
        files.push(...nested);
        continue;
      }
      const lower = item.server_filename.toLowerCase();
      if (lower.endsWith(".cbz") || lower.endsWith(".cbr")) {
        files.push({
          fs_id: String(item.fs_id),
          server_filename: item.server_filename,
          path: item.path,
          size: item.size,
        });
      }
    }
    return files;
  } catch (err) {
    console.error("Terabox list error:", err);
    return [];
  }
}

export async function getTeraboxDownloadLink(
  creds: TeraboxCredentials,
  fsId: string
): Promise<string | null> {
  try {
    const data = (await teraboxRequest(creds, "download", { fidlist: `[${fsId}]` })) as {
      dlink?: Array<{ dlink: string }>;
    };
    return data.dlink?.[0]?.dlink ?? null;
  } catch {
    return null;
  }
}

export async function downloadTeraboxFile(
  creds: TeraboxCredentials,
  fsId: string
): Promise<ArrayBuffer | null> {
  const link = await getTeraboxDownloadLink(creds, fsId);
  if (!link) return null;
  const res = await fetch(link, {
    headers: { Cookie: `ndus=${creds.ndus}` },
  });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

export async function indexTeraboxLibrary(
  creds: TeraboxCredentials,
  userId?: string
): Promise<number> {
  const files = await listTeraboxFiles(creds);
  const db = getAdminDb();
  let count = 0;

  for (const file of files) {
    const format: ComicFormat = file.server_filename.toLowerCase().endsWith(".cbz")
      ? "cbz"
      : "cbr";
    const comicId = `terabox-${file.fs_id}`;

    try {
      const buffer = await downloadTeraboxFile(creds, file.fs_id);
      if (!buffer) continue;

      const { listComicPages } = await import("@/lib/comics/extractPage");
      const { extractCbzCover } = await import("@/lib/comics/cbz");
      const { extractCbrCover } = await import("@/lib/comics/cbr");
      const pages = await listComicPages(buffer, format);
      const cover =
        format === "cbz" ? await extractCbzCover(buffer) : await extractCbrCover(buffer);

      if (cover) {
        await db.collection("catalog_covers").doc(comicId).set({
          mimeType: "image/jpeg",
          data: Buffer.from(cover).toString("base64"),
        });
      }

      await db.collection("catalog").doc("comics").collection("items").doc(comicId).set({
        id: comicId,
        title: file.server_filename.replace(/\.(cbz|cbr)$/i, ""),
        totalPages: pages.length,
        format,
        coverUrl: `/api/comics/${comicId}/cover`,
        source: {
          provider: userId ? "terabox" : "catalog",
          fileId: file.fs_id,
          path: file.path,
          sizeBytes: file.size,
          userId,
        },
        indexedAt: new Date().toISOString(),
      });
      count++;
    } catch (err) {
      console.error(`Failed to index Terabox file ${file.server_filename}:`, err);
    }
  }
  return count;
}

export async function getUserTeraboxComics(uid: string): Promise<Comic[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("catalog")
    .doc("comics")
    .collection("items")
    .where("source.userId", "==", uid)
    .where("source.provider", "==", "terabox")
    .get();
  return snap.docs.map((d) => d.data() as Comic);
}

export async function checkTeraboxHealth(creds: TeraboxCredentials): Promise<boolean> {
  try {
    await teraboxRequest(creds, "gettemplatevariable", {
      fields: '["sign1","sign2","sign3","token"]',
    });
    return true;
  } catch {
    return false;
  }
}
