import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";

export async function GET(request: NextRequest) {
  const uid = await verifyIdToken(request.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/cloud/google/callback`;
  const { getGoogleOAuthUrl } = await import("@/lib/cloud/googleDrive");
  const url = getGoogleOAuthUrl(uid, redirectUri);

  return NextResponse.json({ url });
}
