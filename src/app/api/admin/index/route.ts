import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb } from "@/lib/firebase/admin";
import { indexDriveFolder, getGoogleOAuthUrl, exchangeGoogleCode } from "@/lib/cloud/googleDrive";
import { encryptToken } from "@/lib/cloud/encryption";
import { indexTeraboxLibrary, getAdminTeraboxCredentials } from "@/lib/cloud/terabox";

export async function POST(request: NextRequest) {
  const uid = await verifyIdToken(request.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action: "index_drive" | "index_terabox" | "index_all";
    folderId?: string;
  };

  try {
    if (body.action === "index_drive" || body.action === "index_all") {
      const folderId = body.folderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!folderId) {
        return NextResponse.json({ error: "GOOGLE_DRIVE_FOLDER_ID not set" }, { status: 400 });
      }
      const count = await indexDriveFolder(folderId);
      if (body.action === "index_drive") {
        return NextResponse.json({ indexed: count, source: "google_drive" });
      }
    }

    if (body.action === "index_terabox" || body.action === "index_all") {
      const creds = getAdminTeraboxCredentials();
      if (!creds) {
        return NextResponse.json({ error: "Terabox not configured" }, { status: 400 });
      }
      const count = await indexTeraboxLibrary(creds);
      if (body.action === "index_terabox") {
        return NextResponse.json({ indexed: count, source: "terabox" });
      }
    }

    if (body.action === "index_all") {
      let driveCount = 0;
      let teraboxCount = 0;
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (folderId) driveCount = await indexDriveFolder(folderId);
      const creds = getAdminTeraboxCredentials();
      if (creds) teraboxCount = await indexTeraboxLibrary(creds);
      return NextResponse.json({ drive: driveCount, terabox: teraboxCount });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Index failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (action === "google_auth_url") {
    const uid = request.nextUrl.searchParams.get("uid") ?? "";
    const redirectUri = `${appUrl}/api/cloud/google/callback`;
    const url = getGoogleOAuthUrl(uid, redirectUri);
    return NextResponse.json({ url });
  }

  return NextResponse.json({ status: "ok" });
}
