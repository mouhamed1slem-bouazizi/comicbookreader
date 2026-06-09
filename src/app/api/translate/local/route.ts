import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { translateComicPage } from "@/lib/translate/openrouter";

export async function POST(request: NextRequest) {
  await verifyIdToken(request.headers.get("authorization"));

  const body = (await request.json()) as {
    imageBase64?: string;
    mimeType?: string;
    targetLang: string;
    comicId?: string;
    pageIndex?: number;
  };

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ regions: [], message: "Translation not configured" });
  }

  if (!body.imageBase64) {
    return NextResponse.json({
      regions: [],
      message: "Local translation requires imageBase64 from client",
    });
  }

  try {
    const { regions } = await translateComicPage({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType ?? "image/jpeg",
      targetLang: body.targetLang,
    });
    return NextResponse.json({ regions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed" },
      { status: 500 }
    );
  }
}
