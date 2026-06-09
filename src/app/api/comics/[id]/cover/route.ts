import { NextRequest, NextResponse } from "next/server";
import { getCoverData } from "@/lib/comics/comicService";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cover = await getCoverData(id);
  if (!cover) {
    return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(cover.data), {
    headers: {
      "Content-Type": cover.mimeType,
      "Cache-Control": "public, max-age=604800",
    },
  });
}
