import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase/admin";
import { getComicMetadata, getComicBuffer } from "@/lib/comics/comicService";
import { extractComicPage, hashPageData } from "@/lib/comics/extractPage";
import { translateComicPage } from "@/lib/translate/openrouter";
import {
  buildPageKey,
  getCachedTranslation,
  saveCachedTranslation,
} from "@/lib/translate/cache";

export async function POST(request: NextRequest) {
  const uid = await verifyIdToken(request.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    comicId: string;
    pageIndex: number;
    targetLang: string;
  };

  const { comicId, pageIndex, targetLang } = body;
  if (!comicId || pageIndex === undefined || !targetLang) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const meta = await getComicMetadata(comicId, uid);
  if (!meta) {
    return NextResponse.json({ error: "Comic not found" }, { status: 404 });
  }

  const buffer = await getComicBuffer(comicId, undefined, meta);
  if (!buffer) {
    return NextResponse.json({ error: "Could not load comic" }, { status: 404 });
  }

  const page = await extractComicPage(buffer, meta.format, pageIndex);
  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const imageHash = await hashPageData(page.data);
  const pageKey = buildPageKey(pageIndex, imageHash);

  const cached = await getCachedTranslation(comicId, pageKey, targetLang);
  if (cached) {
    return NextResponse.json({ regions: cached.regions, cached: true });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ regions: [], message: "Translation not configured" });
  }

  try {
    const base64 = Buffer.from(page.data).toString("base64");
    const { regions, model } = await translateComicPage({
      imageBase64: base64,
      mimeType: page.mimeType,
      targetLang,
    });

    const translation = {
      comicId,
      pageIndex,
      pageKey,
      targetLang,
      regions,
      model,
      createdAt: new Date().toISOString(),
      version: 1,
    };

    await saveCachedTranslation(translation);
    return NextResponse.json({ regions, cached: false });
  } catch (err) {
    console.error("Translation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Translation failed" },
      { status: 500 }
    );
  }
}
