import { NextRequest, NextResponse } from "next/server";
import { getComicMetadata } from "@/lib/comics/comicService";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const comic = await getComicMetadata(id);
  if (!comic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(comic);
}
