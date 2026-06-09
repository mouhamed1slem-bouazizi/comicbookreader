import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { exchangeGoogleCode } from "@/lib/cloud/googleDrive";
import { encryptToken } from "@/lib/cloud/encryption";
import { indexDriveFolder } from "@/lib/cloud/googleDrive";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const uid = request.nextUrl.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code || !uid) {
    return NextResponse.redirect(`${appUrl}/settings?error=oauth_failed`);
  }

  try {
    const redirectUri = `${appUrl}/api/cloud/google/callback`;
    const { refreshToken } = await exchangeGoogleCode(code, redirectUri);

    await getAdminDb()
      .collection("users")
      .doc(uid)
      .collection("connections")
      .doc("google_drive")
      .set({
        provider: "google_drive",
        encryptedRefreshToken: encryptToken(refreshToken),
        status: "connected",
        connectedAt: new Date().toISOString(),
        lastSyncAt: new Date().toISOString(),
      });

    const folderId = process.env.GOOGLE_USER_DRIVE_FOLDER_ID;
    if (folderId) {
      await indexDriveFolder(folderId, "google_drive", uid);
    }

    return NextResponse.redirect(`${appUrl}/settings?connected=google_drive`);
  } catch {
    return NextResponse.redirect(`${appUrl}/settings?error=oauth_failed`);
  }
}
