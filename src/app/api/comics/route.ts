import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminConfigError } from "@/lib/firebase/admin";
import { listAllCatalogComics } from "@/lib/comics/comicService";
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

    const tab = request.nextUrl.searchParams.get("tab") ?? "shared";

    if (tab === "my_cloud" || tab === "terabox") {
      const live = await browseTeraboxComics(uid);
      const catalog = await listAllCatalogComics(uid);
      const catalogIds = new Set(catalog.map((c) => c.id));
      const merged = [
        ...catalog.filter((c) => c.source.provider === "terabox"),
        ...live.filter((c) => !catalogIds.has(c.id)),
      ];
      return NextResponse.json({ comics: merged });
    }

    const comics = await listAllCatalogComics();
    return NextResponse.json({
      comics: comics.filter((c) => c.source.provider === "catalog" || !c.source.userId),
    });
  } catch (err) {
    console.error("GET /api/comics error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load comics",
        comics: [],
      },
      { status: 500 }
    );
  }
}
