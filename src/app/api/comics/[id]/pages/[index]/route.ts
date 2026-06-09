import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import {
  getComicMetadata,
  getComicBuffer,
  ensureComicPageCount,
} from "@/lib/comics/comicService";
import { extractComicPage } from "@/lib/comics/extractPage";

export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  try {
    const { id, index } = await params;
    const pageIndex = parseInt(index, 10);
    if (isNaN(pageIndex) || pageIndex < 0) {
      return NextResponse.json({ error: "Invalid page index" }, { status: 400 });
    }

    const uid = await verifyIdToken(request.headers.get("authorization"));
    const meta = await getComicMetadata(id, uid ?? undefined);
    if (!meta) {
      return NextResponse.json({ error: "Comic not found" }, { status: 404 });
    }

    const buffer = await getComicBuffer(id, undefined, meta, uid ?? undefined);
    if (!buffer) {
      return NextResponse.json(
        { error: "Could not load comic from Terabox. Reconnect in Settings with fresh credentials." },
        { status: 404 }
      );
    }

    let totalPages = meta.totalPages;
    if (totalPages === 0) {
      totalPages = await ensureComicPageCount(meta, uid ?? undefined);
    }

    const page = await extractComicPage(buffer, meta.format, pageIndex);
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(page.data), {
      headers: {
        "Content-Type": page.mimeType,
        "Cache-Control": "public, max-age=86400",
        "X-Comic-Total-Pages": String(totalPages > 0 ? totalPages : pageIndex + 1),
      },
    });
  } catch (err) {
    console.error("GET /api/comics/[id]/pages error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load page" },
      { status: 500 }
    );
  }
}
