import { NextRequest, NextResponse } from "next/server";
import { extractComicPage } from "@/lib/comics/extractPage";
import { detectFormat } from "@/lib/comics/extractPage";
import { listComicPages } from "@/lib/comics/extractPage";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const pageIndex = parseInt(String(formData.get("pageIndex") ?? "0"), 10);

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const format = detectFormat(file.name);
  if (!format) {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const page = await extractComicPage(buffer, format, pageIndex);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(page.data), {
    headers: { "Content-Type": page.mimeType },
  });
}

export async function GET(request: NextRequest) {
  const comicId = request.nextUrl.searchParams.get("comicId");
  const pageIndex = parseInt(request.nextUrl.searchParams.get("pageIndex") ?? "0", 10);

  if (!comicId?.startsWith("local-")) {
    return NextResponse.json({ error: "Use catalog API for cloud comics" }, { status: 400 });
  }

  return NextResponse.json({
    message: "Local comics are served client-side via blob URLs",
    comicId,
    pageIndex,
  });
}
