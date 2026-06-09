import type { Comic, ComicFormat } from "@/types/comic";
import { getAdminDb } from "@/lib/firebase/admin";
import { encryptToken, decryptToken } from "./encryption";

export interface TeraboxCredentials {
  ndus: string;
  jsToken?: string;
  appId?: string;
  bdstoken?: string;
  comicsDir?: string;
}

export interface TeraboxFile {
  fs_id: string;
  server_filename: string;
  path: string;
  size: number;
}

interface TeraboxListItem {
  fs_id: number;
  server_filename: string;
  path: string;
  size: number;
  isdir: number;
}

interface TeraboxApiResponse {
  errno: number;
  errmsg?: string;
  list?: TeraboxListItem[];
  dlink?: Array<{ dlink: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TeraboxApp = any;

async function loadTeraboxApp(): Promise<new (ndus: string) => TeraboxApp> {
  const mod = await import("terabox-api");
  return mod.default;
}

export function getDefaultComicsDir(): string {
  return process.env.TERABOX_COMICS_DIR ?? "/Comics";
}

async function createTeraboxClient(creds: TeraboxCredentials): Promise<TeraboxApp> {
  const TeraBoxApp = await loadTeraboxApp();
  const app = new TeraBoxApp(creds.ndus.trim());

  if (creds.jsToken?.trim()) {
    app.data.jsToken = creds.jsToken.trim();
  }

  await app.updateAppData();

  if (!app.data.jsToken && creds.jsToken?.trim()) {
    app.data.jsToken = creds.jsToken.trim();
  }

  if (!app.data.jsToken) {
    throw new Error(
      "Could not obtain jsToken. Copy a fresh jsToken from the Terabox Network tab (list request) and try again."
    );
  }

  return app;
}

export function getAdminTeraboxCredentials(): TeraboxCredentials | null {
  const ndus = process.env.TERABOX_NDUS;
  const jsToken = process.env.TERABOX_JS_TOKEN;
  if (!ndus) return null;
  return {
    ndus,
    jsToken: jsToken || undefined,
    appId: process.env.TERABOX_APP_ID ?? "250528",
    comicsDir: getDefaultComicsDir(),
  };
}

export async function getUserTeraboxCredentials(uid: string): Promise<TeraboxCredentials | null> {
  try {
    const doc = await getAdminDb()
      .collection("users")
      .doc(uid)
      .collection("connections")
      .doc("terabox")
      .get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data?.encryptedCredentials) return null;
    return JSON.parse(decryptToken(data.encryptedCredentials as string)) as TeraboxCredentials;
  } catch (err) {
    console.error("getUserTeraboxCredentials error:", err);
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
      comicsDir: creds.comicsDir ?? getDefaultComicsDir(),
    });
}

export async function validateTeraboxCredentials(
  creds: TeraboxCredentials
): Promise<{ ok: boolean; message: string; errno?: number }> {
  try {
    const app = await createTeraboxClient(creds);
    const dir = creds.comicsDir ?? getDefaultComicsDir();
    const data = (await app.getRemoteDir(dir)) as TeraboxApiResponse;

    if (data.errno === 0) {
      return { ok: true, message: `Connected. Found ${data.list?.length ?? 0} items in ${dir}.` };
    }

    if (data.errno !== 0 && dir !== "/") {
      const root = (await app.getRemoteDir("/")) as TeraboxApiResponse;
      if (root.errno === 0) {
        return {
          ok: true,
          message: `Connected, but folder "${dir}" was not found. Use /Comics or check the folder path.`,
        };
      }
    }

    return {
      ok: false,
      message: data.errmsg ?? `Terabox API error (errno: ${data.errno}). Refresh ndus cookie and jsToken.`,
      errno: data.errno,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Terabox connection failed",
    };
  }
}

export async function listTeraboxFiles(
  creds: TeraboxCredentials,
  dir?: string
): Promise<TeraboxFile[]> {
  try {
    const app = await createTeraboxClient(creds);
    const startDir = dir ?? creds.comicsDir ?? getDefaultComicsDir();
    return await listTeraboxFilesRecursive(app, startDir);
  } catch (err) {
    console.error("Terabox list error:", err);
    return [];
  }
}

async function listTeraboxFilesRecursive(
  app: TeraboxApp,
  dir: string
): Promise<TeraboxFile[]> {
  const data = (await app.getRemoteDir(dir)) as TeraboxApiResponse;
  if (data.errno !== 0 || !data.list) return [];

  const files: TeraboxFile[] = [];
  for (const item of data.list) {
    if (item.isdir) {
      const nested = await listTeraboxFilesRecursive(app, item.path);
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
}

export async function downloadTeraboxFile(
  creds: TeraboxCredentials,
  fsId: string
): Promise<ArrayBuffer | null> {
  try {
    const app = await createTeraboxClient(creds);
    const data = (await app.download([Number(fsId)])) as TeraboxApiResponse & {
      dlink?: string[];
    };

    if (data.errno !== 0) {
      console.error("Terabox download errno:", data.errno, data.errmsg);
      return null;
    }

    const link = Array.isArray(data.dlink) ? data.dlink[0] : null;
    if (!link) return null;

    const res = await fetch(link, {
      headers: {
        Cookie: app.params.cookie,
        "User-Agent": app.params.ua,
        Referer: "https://www.terabox.com/",
      },
    });
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch (err) {
    console.error("Terabox download error:", err);
    return null;
  }
}

export async function syncTeraboxCatalogMetadata(
  creds: TeraboxCredentials,
  userId: string
): Promise<number> {
  const files = await listTeraboxFiles(creds);
  const db = getAdminDb();
  let count = 0;

  for (const file of files) {
    const format: ComicFormat = file.server_filename.toLowerCase().endsWith(".cbz")
      ? "cbz"
      : "cbr";
    const comicId = `terabox-${file.fs_id}`;

    await db
      .collection("catalog")
      .doc("comics")
      .collection("items")
      .doc(comicId)
      .set(
        {
          id: comicId,
          title: file.server_filename.replace(/\.(cbz|cbr)$/i, ""),
          totalPages: 0,
          format,
          source: {
            provider: "terabox",
            fileId: file.fs_id,
            path: file.path,
            sizeBytes: file.size,
            userId,
          },
          indexedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    count++;
  }
  return count;
}

export function teraboxFileToComic(file: TeraboxFile, userId: string): Comic {
  const format: ComicFormat = file.server_filename.toLowerCase().endsWith(".cbz")
    ? "cbz"
    : "cbr";
  return {
    id: `terabox-${file.fs_id}`,
    title: file.server_filename.replace(/\.(cbz|cbr)$/i, ""),
    totalPages: 0,
    format,
    source: {
      provider: "terabox",
      fileId: file.fs_id,
      path: file.path,
      sizeBytes: file.size,
      userId,
    },
    indexedAt: new Date().toISOString(),
  };
}

export async function browseTeraboxComics(uid: string): Promise<Comic[]> {
  const creds = await getUserTeraboxCredentials(uid);
  if (!creds) return [];
  const files = await listTeraboxFiles(creds);
  return files.map((file) => teraboxFileToComic(file, uid));
}

export async function resolveTeraboxComic(
  comicId: string,
  uid: string
): Promise<Comic | null> {
  if (!comicId.startsWith("terabox-")) return null;
  const fsId = comicId.replace(/^terabox-/, "");

  const db = getAdminDb();
  const doc = await db
    .collection("catalog")
    .doc("comics")
    .collection("items")
    .doc(comicId)
    .get();
  if (doc.exists) return doc.data() as Comic;

  const creds = await getUserTeraboxCredentials(uid);
  if (!creds) return null;
  const files = await listTeraboxFiles(creds);
  const file = files.find((f) => f.fs_id === fsId);
  if (!file) return null;
  return teraboxFileToComic(file, uid);
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
      let totalPages = 0;
      let coverUrl: string | undefined;

      const buffer = await downloadTeraboxFile(creds, file.fs_id);
      if (buffer) {
        const { listComicPages } = await import("@/lib/comics/extractPage");
        const { extractCbzCover } = await import("@/lib/comics/cbz");
        const { extractCbrCover } = await import("@/lib/comics/cbr");
        const pages = await listComicPages(buffer, format);
        totalPages = pages.length;
        const cover =
          format === "cbz" ? await extractCbzCover(buffer) : await extractCbrCover(buffer);

        if (cover) {
          await db.collection("catalog_covers").doc(comicId).set({
            mimeType: "image/jpeg",
            data: Buffer.from(cover).toString("base64"),
          });
          coverUrl = `/api/comics/${comicId}/cover`;
        }
      }

      await db.collection("catalog").doc("comics").collection("items").doc(comicId).set({
        id: comicId,
        title: file.server_filename.replace(/\.(cbz|cbr)$/i, ""),
        totalPages,
        format,
        coverUrl,
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
  const result = await validateTeraboxCredentials(creds);
  return result.ok;
}
