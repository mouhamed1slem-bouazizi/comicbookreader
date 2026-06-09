import { NextRequest, NextResponse } from "next/server";
import { getComicMetadata, getComicBuffer, getCoverData } from "@/lib/comics/comicService";
import { extractComicPage } from "@/lib/comics/extractPage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index } = await params;
  const pageIndex = parseInt(index, 10);
  if (isNaN(pageIndex) || pageIndex < 0) {
    return NextResponse.json({ error: "Invalid page index" }, { status: 400 });
  }

  const meta = await getComicMetadata(id);
  if (!meta) {
    return NextResponse.json({ error: "Comic not found" }, { status: 404 });
  }

  const buffer = await getComicBuffer(id);
  if (!buffer) {
    return NextResponse.json({ error: "Could not load comic file" }, { status: 404 });
  }

  const page = await extractComicPage(buffer, meta.format, pageIndex);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(page.data), {
    headers: {
      "Content-Type": page.mimeType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
