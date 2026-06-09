export function parseLocalComicId(comicId: string): boolean {
  return comicId.startsWith("local-");
}
