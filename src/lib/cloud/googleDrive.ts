import { google } from "googleapis";
import type { Comic, ComicFormat } from "@/types/comic";
import { extractCbzCover, getMimeFromName } from "@/lib/comics/cbz";
import { extractCbrCover } from "@/lib/comics/cbr";
import { listComicPages } from "@/lib/comics/extractPage";
import { getAdminDb } from "@/lib/firebase/admin";

export interface DriveCredentials {
  type: "service_account" | "oauth";
  serviceAccountJson?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
}

function getDriveClient(creds: DriveCredentials) {
  if (creds.type === "service_account" && creds.serviceAccountJson) {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(creds.serviceAccountJson) as Record<string, string>,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    return google.drive({ version: "v3", auth });
  }
  const oauth2 = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  return google.drive({ version: "v3", auth: oauth2 });
}

export function getAdminDriveClient() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return getDriveClient({ type: "service_account", serviceAccountJson });
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    return getDriveClient({
      type: "oauth",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    });
  }
  throw new Error("Google Drive is not configured.");
}

export function getUserDriveClient(refreshToken: string) {
  return getDriveClient({
    type: "oauth",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken,
  });
}

export async function listComicFilesInFolder(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  path = ""
): Promise<Array<{ id: string; name: string; path: string; size: number; format: ComicFormat }>> {
  const results: Array<{ id: string; name: string; path: string; size: number; format: ComicFormat }> = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: 200,
      pageToken,
    });

    for (const file of res.data.files ?? []) {
      const name = file.name ?? "";
      const lower = name.toLowerCase();
      const fullPath = path ? `${path}/${name}` : name;

      if (file.mimeType === "application/vnd.google-apps.folder" && file.id) {
        const nested = await listComicFilesInFolder(drive, file.id, fullPath);
        results.push(...nested);
        continue;
      }

      let format: ComicFormat | null = null;
      if (lower.endsWith(".cbz")) format = "cbz";
      if (lower.endsWith(".cbr")) format = "cbr";
      if (format && file.id) {
        results.push({
          id: file.id,
          name,
          path: fullPath,
          size: Number(file.size ?? 0),
          format,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return results;
}

export async function downloadDriveFile(
  drive: ReturnType<typeof google.drive>,
  fileId: string
): Promise<ArrayBuffer> {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return res.data as ArrayBuffer;
}

export async function indexDriveFolder(
  folderId: string,
  provider: "google_drive" | "catalog" = "catalog",
  userId?: string
): Promise<number> {
  let drive;
  if (userId) {
    const connDoc = await getAdminDb()
      .collection("users")
      .doc(userId)
      .collection("connections")
      .doc("google_drive")
      .get();
    const encrypted = connDoc.data()?.encryptedRefreshToken as string | undefined;
    if (!encrypted) throw new Error("User Google Drive not connected");
    const { decryptToken } = await import("./encryption");
    const refreshToken = decryptToken(encrypted);
    drive = getUserDriveClient(refreshToken);
  } else {
    drive = getAdminDriveClient();
  }

  const files = await listComicFilesInFolder(drive, folderId);
  const db = getAdminDb();
  let count = 0;

  for (const file of files) {
    const comicId = `gdrive-${file.id}`;
    let coverUrl: string | undefined;
    try {
      const buffer = await downloadDriveFile(drive, file.id);
      const cover =
        file.format === "cbz"
          ? await extractCbzCover(buffer)
          : await extractCbrCover(buffer);
      const pages = await listComicPages(buffer, file.format);
      if (cover) {
        const coverRef = db.collection("catalog_covers").doc(comicId);
        await coverRef.set({
          mimeType: getMimeFromName(file.name),
          data: Buffer.from(cover).toString("base64"),
        });
        coverUrl = `/api/comics/${comicId}/cover`;
      }
      await db.collection("catalog").doc("comics").collection("items").doc(comicId).set({
        id: comicId,
        title: file.name.replace(/\.(cbz|cbr)$/i, ""),
        totalPages: pages.length,
        format: file.format,
        coverUrl,
        source: {
          provider: userId ? "google_drive" : "catalog",
          fileId: file.id,
          path: file.path,
          sizeBytes: file.size,
          userId,
        },
        indexedAt: new Date().toISOString(),
      });
      count++;
    } catch (err) {
      console.error(`Failed to index ${file.name}:`, err);
    }
  }
  return count;
}

export async function getCatalogComics(): Promise<Comic[]> {
  const db = getAdminDb();
  const snap = await db.collection("catalog").doc("comics").collection("items").get();
  return snap.docs.map((d) => d.data() as Comic);
}

export async function getComicById(comicId: string): Promise<Comic | null> {
  const db = getAdminDb();
  const doc = await db.collection("catalog").doc("comics").collection("items").doc(comicId).get();
  if (!doc.exists) return null;
  return doc.data() as Comic;
}

export function getGoogleOAuthUrl(state: string, redirectUri: string): string {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.readonly"],
    state,
  });
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ refreshToken: string; accessToken: string }> {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) throw new Error("No refresh token received.");
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
  };
}
