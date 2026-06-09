import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { getUserTeraboxCredentials, listTeraboxFiles } from "@/lib/cloud/terabox";

export async function GET(request: NextRequest) {
  const uid = await verifyIdToken(request.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await getUserTeraboxCredentials(uid);
  if (!creds) {
    return NextResponse.json({ error: "Terabox not connected" }, { status: 404 });
  }

  const files = await listTeraboxFiles(creds);
  return NextResponse.json({ files });
}
