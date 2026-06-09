import { createExtractorFromData } from "node-unrar-js";

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

export async function listCbrPages(buffer: ArrayBuffer): Promise<string[]> {
  const extractor = await createExtractorFromData({ data: buffer });
  const list = extractor.getFileList();
  const fileHeaders = [...list.fileHeaders];
  const imageNames = fileHeaders
    .filter((f) => !f.flags.directory && isImageFile(f.name))
    .map((f) => f.name);
  return sortImageEntries(imageNames);
}

export async function extractCbrPage(
  buffer: ArrayBuffer,
  pageIndex: number
): Promise<{ data: Uint8Array; mimeType: string; name: string } | null> {
  const pages = await listCbrPages(buffer);
  if (pageIndex < 0 || pageIndex >= pages.length) return null;
  const name = pages[pageIndex];
  const extractor = await createExtractorFromData({ data: buffer });
  const extracted = extractor.extract({ files: [name] });
  const files = [...extracted.files];
  const file = files.find((f) => f.fileHeader.name === name);
  if (!file?.extraction) return null;
  const lower = name.toLowerCase();
  let mimeType = "image/jpeg";
  if (lower.endsWith(".png")) mimeType = "image/png";
  else if (lower.endsWith(".webp")) mimeType = "image/webp";
  else if (lower.endsWith(".gif")) mimeType = "image/gif";
  return { data: file.extraction, mimeType, name };
}

export async function extractCbrCover(buffer: ArrayBuffer): Promise<Uint8Array | null> {
  const page = await extractCbrPage(buffer, 0);
  return page?.data ?? null;
}
