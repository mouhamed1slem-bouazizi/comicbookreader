import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { listAllCatalogComics } from "@/lib/comics/comicService";

export async function GET(request: NextRequest) {
  const uid = await verifyIdToken(request.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tab = request.nextUrl.searchParams.get("tab") ?? "shared";
  const comics = await listAllCatalogComics(tab === "my_cloud" ? uid : undefined);

  if (tab === "shared") {
    return NextResponse.json({
      comics: comics.filter((c) => c.source.provider === "catalog" || !c.source.userId),
    });
  }

  return NextResponse.json({
    comics: comics.filter((c) => c.source.userId === uid),
  });
}
