import type { Comic, ComicFormat } from "@/types/comic";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
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
  dlink?: string;
  direct_link?: string;
}

interface TeraboxApiResponse {
  errno: number;
  errmsg?: string;
  list?: TeraboxListItem[];
  info?: Array<{ dlink?: string; direct_link?: string }>;
  dlink?: Array<string | { dlink?: string }>;
}

const TERABOX_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TeraboxApp = any;

function extractTeraboxDownloadLink(data: TeraboxApiResponse): string | null {
  for (const item of data.info ?? []) {
    if (item.dlink) return item.dlink;
    if (item.direct_link) return item.direct_link;
  }

  for (const item of data.list ?? []) {
    if (item.dlink) return item.dlink;
    if (item.direct_link) return item.direct_link;
  }

  for (const entry of data.dlink ?? []) {
    if (typeof entry === "string" && entry) return entry;
    if (entry && typeof entry === "object" && entry.dlink) return entry.dlink;
  }

  return null;
}

function appendTeraboxAuthParams(url: URL, app: TeraboxApp): void {
  url.searchParams.set("app_id", String(app.params.app?.app_id ?? 250528));
  url.searchParams.set("web", "1");
  url.searchParams.set("channel", "dubox");
  url.searchParams.set("clienttype", "0");
  if (app.data.jsToken) {
    url.searchParams.set("jsToken", app.data.jsToken);
  }
}

function normalizeTeraboxDlink(link: string): string {
  if (link.includes("origin=dlna")) return link;
  return link.includes("?") ? `${link}&origin=dlna` : `${link}?origin=dlna`;
}

async function handleTeraboxResponse(
  app: TeraboxApp,
  res: Response,
  path: string,
  attempt: number
): Promise<TeraboxApiResponse | "retry"> {
  const regionPrefix =
    res.headers.get("region-domain-prefix") ??
    res.headers.get("url-domain-prefix");
  if (regionPrefix) {
    app.params.whost = `https://${regionPrefix}.terabox.com`;
    return "retry";
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (location) {
      const resolved = new URL(location, app.params.whost);
      if (resolved.origin !== app.params.whost) {
        app.params.whost = resolved.origin;
        return "retry";
      }
    }
  }

  if (!res.ok) {
    console.error(`Terabox HTTP ${res.status} for ${path}`);
    return { errno: res.status, errmsg: `HTTP ${res.status}` };
  }

  const data = (await res.json()) as TeraboxApiResponse;
  if (data.errno === -6 && attempt < 2) return "retry";
  return data;
}

async function teraboxGet(
  app: TeraboxApp,
  path: string,
  params: Record<string, string>
): Promise<TeraboxApiResponse> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = new URL(app.params.whost + path);
    appendTeraboxAuthParams(url, app);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": app.params.ua,
        Cookie: app.params.cookie,
        Accept: "application/json, text/plain, */*",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(app.TERABOX_TIMEOUT ?? 120000),
    });

    const outcome = await handleTeraboxResponse(app, res, path, attempt);
    if (outcome === "retry") continue;
    return outcome;
  }

  return { errno: -1, errmsg: "Terabox GET request failed after retries" };
}

async function teraboxPostForm(
  app: TeraboxApp,
  path: string,
  fields: Record<string, string | number>
): Promise<TeraboxApiResponse> {
  const body = new URLSearchParams(
    Object.entries(fields).map(([key, value]) => [key, String(value)])
  ).toString();

  for (let attempt = 0; attempt < 3; attempt++) {
    const url = new URL(app.params.whost + path);
    appendTeraboxAuthParams(url, app);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": app.params.ua,
        Cookie: app.params.cookie,
        Accept: "application/json, text/plain, */*",
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(app.TERABOX_TIMEOUT ?? 120000),
    });

    const outcome = await handleTeraboxResponse(app, res, path, attempt);
    if (outcome === "retry") continue;
    return outcome;
  }

  return { errno: -1, errmsg: "Terabox POST request failed after retries" };
}

async function getTeraboxHomeSign(
  app: TeraboxApp
): Promise<{ sign: string; timestamp: number } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${app.params.whost}/api/home/info`, {
      headers: {
        Cookie: app.params.cookie,
        "User-Agent": app.params.ua,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(app.TERABOX_TIMEOUT ?? 120000),
    });

    const regionPrefix =
      res.headers.get("region-domain-prefix") ??
      res.headers.get("url-domain-prefix");
    if (regionPrefix) {
      app.params.whost = `https://${regionPrefix}.terabox.com`;
      continue;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        const resolved = new URL(location, app.params.whost);
        app.params.whost = resolved.origin;
        continue;
      }
    }

    if (!res.ok) return null;

    const data = (await res.json()) as {
      errno: number;
      data?: { sign1?: string; sign3?: string; timestamp?: number };
    };
    if (data.errno !== 0 || !data.data?.sign1 || !data.data.sign3 || !data.data.timestamp) {
      return null;
    }

    return {
      sign: app.SignDownload(data.data.sign3, data.data.sign1),
      timestamp: data.data.timestamp,
    };
  }

  return null;
}

async function resolveTeraboxDlink(
  app: TeraboxApp,
  fsId: string,
  remotePath?: string
): Promise<string | null> {
  if (remotePath) {
    for (const target of [
      JSON.stringify([remotePath]),
      JSON.stringify([{ fs_id: Number(fsId), path: remotePath }]),
    ]) {
      const filemetaParams = { target, dlink: "1", origin: "dlna" };
      for (const meta of [
        await teraboxGet(app, "/api/filemetas", filemetaParams),
        await teraboxPostForm(app, "/api/filemetas", {
          dlink: 1,
          origin: "dlna",
          target,
        }),
      ]) {
        if (meta.errno === 0) {
          const link = extractTeraboxDownloadLink(meta);
          if (link) return normalizeTeraboxDlink(link);
        } else {
          console.error("Terabox filemetas errno:", meta.errno, meta.errmsg, "path:", remotePath);
        }
      }
    }
  }

  const home = await getTeraboxHomeSign(app);
  if (home) {
    for (const fidlist of [JSON.stringify([fsId]), JSON.stringify([Number(fsId)])]) {
      const downloadParams = {
        fidlist,
        type: "dlink",
        vip: "2",
        sign: home.sign,
        timestamp: String(home.timestamp),
        need_speed: "1",
      };
      for (const dl of [
        await teraboxGet(app, "/api/download", downloadParams),
        await teraboxPostForm(app, "/api/download", {
          fidlist,
          type: "dlink",
          vip: 2,
          sign: home.sign,
          timestamp: home.timestamp,
          need_speed: 1,
        }),
      ]) {
        if (dl.errno === 0) {
          const link = extractTeraboxDownloadLink(dl);
          if (link) return normalizeTeraboxDlink(link);
        } else {
          console.error("Terabox download errno:", dl.errno, dl.errmsg, "fsId:", fsId);
        }
      }
    }
  } else {
    console.error("Terabox getHomeInfo/sign failed for fsId:", fsId);
  }

  try {
    const dl = (await app.download([Number(fsId)])) as TeraboxApiResponse;
    if (dl.errno === 0) {
      const link = extractTeraboxDownloadLink(dl);
      if (link) return normalizeTeraboxDlink(link);
    }
    console.error("Terabox app.download errno:", dl.errno, dl.errmsg);
  } catch (err) {
    console.error("Terabox app.download error:", err);
  }

  return null;
}

async function fetchTeraboxFileContent(
  link: string,
  cookie: string,
  userAgent: string
): Promise<ArrayBuffer | null> {
  const headers = {
    Cookie: cookie,
    "User-Agent": userAgent,
    Referer: "https://www.terabox.com/",
  };

  try {
    const probe = await fetch(link, { method: "GET", redirect: "manual", headers });
    if (probe.status >= 300 && probe.status < 400) {
      const location = probe.headers.get("location");
      if (location) {
        const res = await fetch(location, {
          headers: { "User-Agent": userAgent },
          signal: AbortSignal.timeout(TERABOX_DOWNLOAD_TIMEOUT_MS),
        });
        if (!res.ok) {
          console.error("Terabox CDN fetch failed:", res.status, res.statusText);
          return null;
        }
        return res.arrayBuffer();
      }
    }
    if (probe.ok) return probe.arrayBuffer();
  } catch (err) {
    console.error("Terabox redirect probe failed:", err);
  }

  try {
    const res = await fetch(link, {
      headers,
      signal: AbortSignal.timeout(TERABOX_DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("Terabox file fetch failed:", res.status, res.statusText);
      return null;
    }
    return res.arrayBuffer();
  } catch (err) {
    console.error("Terabox file fetch error:", err);
    return null;
  }
}

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
  app.TERABOX_TIMEOUT = 120000;

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

  try {
    await app.checkLogin();
  } catch {
    // Regional host refresh is best-effort.
  }

  return app;
}

export function mergeTeraboxSession(
  creds: TeraboxCredentials,
  app: TeraboxApp
): TeraboxCredentials {
  return {
    ...creds,
    jsToken: app.data.jsToken || creds.jsToken,
    bdstoken: app.data.bdstoken || creds.bdstoken,
  };
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
): Promise<{ ok: boolean; message: string; errno?: number; session?: TeraboxCredentials }> {
  try {
    const app = await createTeraboxClient(creds);
    const session = mergeTeraboxSession(creds, app);
    const dir = session.comicsDir ?? getDefaultComicsDir();
    const data = (await app.getRemoteDir(dir)) as TeraboxApiResponse;

    if (data.errno === 0) {
      return {
        ok: true,
        message: `Connected. Found ${data.list?.length ?? 0} items in ${dir}.`,
        session,
      };
    }

    if (data.errno !== 0 && dir !== "/") {
      const root = (await app.getRemoteDir("/")) as TeraboxApiResponse;
      if (root.errno === 0) {
        return {
          ok: true,
          message: `Connected, but folder "${dir}" was not found. Use /Comics or check the folder path.`,
          session,
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
  fsId: string,
  remotePath?: string,
  uid?: string
): Promise<ArrayBuffer | null> {
  try {
    const app = await createTeraboxClient(creds);
    const session = mergeTeraboxSession(creds, app);

    if (uid && session.jsToken && session.jsToken !== creds.jsToken) {
      try {
        await saveTeraboxCredentials(uid, session);
      } catch (err) {
        console.error("Failed to refresh Terabox session tokens:", err);
      }
    }

    let path = remotePath;
    if (!path) {
      const files = await listTeraboxFilesRecursive(
        app,
        session.comicsDir ?? getDefaultComicsDir()
      );
      path = files.find((file) => file.fs_id === fsId)?.path;
    }

    const link = await resolveTeraboxDlink(app, fsId, path);
    if (!link) {
      console.error("Terabox download: no dlink for fs_id", fsId, "path:", path);
      return null;
    }

    return fetchTeraboxFileContent(link, app.params.cookie, app.params.ua);
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
  if (!isFirebaseAdminConfigured()) return null;

  const fsId = comicId.replace(/^terabox-/, "");

  try {
    const doc = await getAdminDb()
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
  } catch (err) {
    console.error("resolveTeraboxComic error:", err);
    return null;
  }
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
