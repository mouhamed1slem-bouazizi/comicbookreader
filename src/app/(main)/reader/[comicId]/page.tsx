import { ReaderPageClient } from "@/components/reader/ReaderPageClient";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ comicId: string }>;
}) {
  const { comicId } = await params;
  return <ReaderPageClient comicId={decodeURIComponent(comicId)} />;
}
