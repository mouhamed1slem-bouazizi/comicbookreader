import type { PageTranslation, TranslationRegion } from "@/types/translation";
import { getAdminDb } from "@/lib/firebase/admin";

export async function getCachedTranslation(
  comicId: string,
  pageKey: string,
  targetLang: string
): Promise<PageTranslation | null> {
  try {
    const db = getAdminDb();
    const doc = await db
      .collection("translations")
      .doc(comicId)
      .collection("pages")
      .doc(`${pageKey}_${targetLang}`)
      .get();
    if (!doc.exists) return null;
    return doc.data() as PageTranslation;
  } catch {
    return null;
  }
}

export async function saveCachedTranslation(translation: PageTranslation): Promise<void> {
  const db = getAdminDb();
  await db
    .collection("translations")
    .doc(translation.comicId)
    .collection("pages")
    .doc(`${translation.pageKey}_${translation.targetLang}`)
    .set(translation);
}

export function buildPageKey(pageIndex: number, imageHash: string): string {
  return `p${pageIndex}_${imageHash.slice(0, 16)}`;
}
