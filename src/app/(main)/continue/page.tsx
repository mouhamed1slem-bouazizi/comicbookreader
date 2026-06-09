"use client";

import { useEffect, useState } from "react";
import { ComicCard } from "@/components/library/ComicCard";
import { ResponsiveGrid } from "@/components/layout/ResponsiveGrid";
import { useAuth } from "@/lib/firebase/auth-context";
import { getRecentProgress, getRecentCompleted } from "@/lib/progress";
import type { ReadingProgress, CompletedComic } from "@/types/comic";

export default function ContinuePage() {
  const { user } = useAuth();
  const [inProgress, setInProgress] = useState<ReadingProgress[]>([]);
  const [completed, setCompleted] = useState<CompletedComic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [progress, done] = await Promise.all([
        getRecentProgress(user.uid, 12),
        getRecentCompleted(user.uid, 12),
      ]);
      setInProgress(progress);
      setCompleted(done);
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold lg:text-3xl">Continue Reading</h1>
        <p className="text-sm text-zinc-500">Pick up where you left off</p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">In Progress</h2>
        {inProgress.length === 0 ? (
          <p className="text-zinc-500">No comics in progress.</p>
        ) : (
          <ResponsiveGrid>
            {inProgress.map((item) => (
              <ComicCard
                key={item.comicId}
                id={item.comicId}
                title={item.title}
                coverUrl={item.coverUrl}
                totalPages={item.totalPages}
                pageIndex={item.pageIndex}
                badge={`${item.percent}%`}
              />
            ))}
          </ResponsiveGrid>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Recently Completed</h2>
        {completed.length === 0 ? (
          <p className="text-zinc-500">No completed comics yet.</p>
        ) : (
          <ResponsiveGrid>
            {completed.map((item) => (
              <ComicCard
                key={item.comicId}
                id={item.comicId}
                title={item.title}
                coverUrl={item.coverUrl}
                badge="Done"
              />
            ))}
          </ResponsiveGrid>
        )}
      </section>
    </div>
  );
}
