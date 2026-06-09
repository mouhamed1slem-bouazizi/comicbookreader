import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { indexTeraboxLibrary, getAdminTeraboxCredentials, saveTeraboxCredentials, checkTeraboxHealth } from "@/lib/cloud/terabox";
import type { TeraboxCredentials } from "@/lib/cloud/terabox";

export async function POST(request: NextRequest) {
  const uid = await verifyIdToken(request.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as TeraboxCredentials;
  if (!body.ndus || !body.jsToken) {
    return NextResponse.json({ error: "ndus and jsToken are required" }, { status: 400 });
  }

  const creds: TeraboxCredentials = {
    ndus: body.ndus,
    jsToken: body.jsToken,
    appId: body.appId ?? "250528",
    bdstoken: body.bdstoken,
  };

  const healthy = await checkTeraboxHealth(creds);
  if (!healthy) {
    return NextResponse.json({ error: "Invalid Terabox credentials" }, { status: 400 });
  }

  await saveTeraboxCredentials(uid, creds);

  try {
    await indexTeraboxLibrary(creds, uid);
  } catch (err) {
    console.error("Terabox user index failed:", err);
  }

  return NextResponse.json({ status: "connected" });
}
