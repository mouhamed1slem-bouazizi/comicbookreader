"use client";

import Link from "next/link";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn, formatPercent } from "@/lib/utils";

interface ComicCardProps {
  id: string;
  title: string;
  coverUrl?: string;
  totalPages?: number;
  pageIndex?: number;
  badge?: string;
  source?: string;
  className?: string;
}

export function ComicCard({
  id,
  title,
  coverUrl,
  totalPages,
  pageIndex,
  badge,
  source,
  className,
}: ComicCardProps) {
  const progress =
    pageIndex !== undefined && totalPages
      ? formatPercent(pageIndex + 1, totalPages)
      : null;

  return (
    <Link href={`/reader/${encodeURIComponent(id)}`}>
      <Card
        className={cn(
          "group overflow-hidden transition-transform hover:scale-[1.02] hover:border-violet-500/50",
          className
        )}
      >
        <div className="relative aspect-[2/3] bg-zinc-800">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 20vw"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <BookOpen className="h-12 w-12 text-zinc-600" />
            </div>
          )}
          {badge && (
            <span className="absolute left-2 top-2 rounded bg-violet-600 px-2 py-0.5 text-xs font-medium">
              {badge}
            </span>
          )}
          {progress !== null && progress > 0 && progress < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-700">
              <div className="h-full bg-violet-500" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-medium leading-tight">{title}</h3>
          {totalPages !== undefined && (
            <p className="mt-1 text-xs text-zinc-500">{totalPages} pages</p>
          )}
          {source && <p className="mt-0.5 text-xs capitalize text-zinc-600">{source.replace("_", " ")}</p>}
        </div>
      </Card>
    </Link>
  );
}
