import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { getComicMetadata } from "@/lib/comics/comicService";

export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const uid = await verifyIdToken(request.headers.get("authorization"));
    const comic = await getComicMetadata(id, uid ?? undefined);
    if (!comic) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Page count is resolved lazily when the first page loads (see pages API).
    return NextResponse.json(comic);
  } catch (err) {
    console.error("GET /api/comics/[id]/meta error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load comic" },
      { status: 500 }
    );
  }
}
