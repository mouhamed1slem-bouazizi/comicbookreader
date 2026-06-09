import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminConfigError } from "@/lib/firebase/admin";
import { browseTeraboxComics } from "@/lib/cloud/terabox";

export async function GET(request: NextRequest) {
  try {
    const configError = getAdminConfigError();
    if (configError) {
      return NextResponse.json({ error: configError, comics: [] }, { status: 503 });
    }

    const uid = await verifyIdToken(request.headers.get("authorization"));
    if (!uid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const comics = await browseTeraboxComics(uid);
    return NextResponse.json({ comics });
  } catch (err) {
    console.error("GET /api/cloud/terabox/browse error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to browse Terabox",
        comics: [],
      },
      { status: 500 }
    );
  }
}
