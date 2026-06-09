import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import {
  indexTeraboxLibrary,
  saveTeraboxCredentials,
  validateTeraboxCredentials,
  getDefaultComicsDir,
} from "@/lib/cloud/terabox";
import type { TeraboxCredentials } from "@/lib/cloud/terabox";

export async function POST(request: NextRequest) {
  const uid = await verifyIdToken(request.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as TeraboxCredentials;
  const ndus = body.ndus?.trim();
  if (!ndus) {
    return NextResponse.json({ error: "ndus cookie is required" }, { status: 400 });
  }

  const creds: TeraboxCredentials = {
    ndus,
    jsToken: body.jsToken?.trim() || undefined,
    appId: body.appId ?? "250528",
    bdstoken: body.bdstoken,
    comicsDir: body.comicsDir?.trim() || getDefaultComicsDir(),
  };

  const validation = await validateTeraboxCredentials(creds);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message, errno: validation.errno },
      { status: 400 }
    );
  }

  await saveTeraboxCredentials(uid, creds);

  let indexed = 0;
  try {
    indexed = await indexTeraboxLibrary(creds, uid);
  } catch (err) {
    console.error("Terabox user index failed:", err);
  }

  return NextResponse.json({
    status: "connected",
    message: validation.message,
    indexed,
  });
}
