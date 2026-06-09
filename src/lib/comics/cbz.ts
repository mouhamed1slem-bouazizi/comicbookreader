import JSZip from "jszip";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function sortImageEntries(names: string[]): string[] {
  return names.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

export async function listCbzPages(buffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const imageNames = Object.keys(zip.files).filter(
    (name) => !zip.files[name].dir && isImageFile(name)
  );
  return sortImageEntries(imageNames);
}

export async function extractCbzPage(
  buffer: ArrayBuffer,
  pageIndex: number
): Promise<{ data: Uint8Array; mimeType: string; name: string } | null> {
  const pages = await listCbzPages(buffer);
  if (pageIndex < 0 || pageIndex >= pages.length) return null;
  const name = pages[pageIndex];
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file(name);
  if (!file) return null;
  const data = await file.async("uint8array");
  const lower = name.toLowerCase();
  let mimeType = "image/jpeg";
  if (lower.endsWith(".png")) mimeType = "image/png";
  else if (lower.endsWith(".webp")) mimeType = "image/webp";
  else if (lower.endsWith(".gif")) mimeType = "image/gif";
  return { data, mimeType, name };
}

export async function extractCbzCover(buffer: ArrayBuffer): Promise<Uint8Array | null> {
  const page = await extractCbzPage(buffer, 0);
  return page?.data ?? null;
}

export function getMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}
