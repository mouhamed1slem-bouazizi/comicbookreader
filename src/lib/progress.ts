"use client";

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  deleteDoc,
  limit,
} from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase/client";
import type {
  ComicSourceRef,
  CompletedComic,
  ReadingProgress,
} from "@/types/comic";
import { formatPercent } from "@/lib/utils";

const PROGRESS_KEY = "comicreader_progress";
const COMPLETED_KEY = "comicreader_completed";

function getLocalProgress(uid: string): Record<string, ReadingProgress> {
  const raw = localStorage.getItem(`${PROGRESS_KEY}_${uid}`);
  return raw ? (JSON.parse(raw) as Record<string, ReadingProgress>) : {};
}

function saveLocalProgress(uid: string, data: Record<string, ReadingProgress>) {
  localStorage.setItem(`${PROGRESS_KEY}_${uid}`, JSON.stringify(data));
}

function getLocalCompleted(uid: string): Record<string, CompletedComic> {
  const raw = localStorage.getItem(`${COMPLETED_KEY}_${uid}`);
  return raw ? (JSON.parse(raw) as Record<string, CompletedComic>) : {};
}

function saveLocalCompleted(uid: string, data: Record<string, CompletedComic>) {
  localStorage.setItem(`${COMPLETED_KEY}_${uid}`, JSON.stringify(data));
}

/** Firestore rejects undefined field values — strip them recursively. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (value === undefined) {
      delete result[key];
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = stripUndefined(value as Record<string, unknown>);
    }
  }
  return result as T;
}

export async function saveProgress(
  uid: string,
  data: {
    comicId: string;
    title: string;
    pageIndex: number;
    totalPages: number;
    sourceRef: ComicSourceRef;
    coverUrl?: string;
  }
): Promise<void> {
  const progress: ReadingProgress = {
    comicId: data.comicId,
    title: data.title,
    pageIndex: data.pageIndex,
    totalPages: data.totalPages,
    percent: formatPercent(data.pageIndex + 1, data.totalPages),
    updatedAt: new Date().toISOString(),
    sourceRef: data.sourceRef,
    ...(data.coverUrl ? { coverUrl: data.coverUrl } : {}),
  };

  if (!isFirebaseConfigured()) {
    const all = getLocalProgress(uid);
    all[data.comicId] = progress;
    saveLocalProgress(uid, all);
    return;
  }

  await setDoc(
    doc(getFirebaseDb(), "users", uid, "progress", data.comicId),
    stripUndefined(progress as unknown as Record<string, unknown>)
  );
}

export async function getProgressList(uid: string): Promise<ReadingProgress[]> {
  if (!isFirebaseConfigured()) {
    return Object.values(getLocalProgress(uid)).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }
  const snap = await getDocs(
    query(collection(getFirebaseDb(), "users", uid, "progress"), orderBy("updatedAt", "desc"))
  );
  return snap.docs.map((d) => d.data() as ReadingProgress);
}

export async function getProgress(
  uid: string,
  comicId: string
): Promise<ReadingProgress | null> {
  if (!isFirebaseConfigured()) {
    return getLocalProgress(uid)[comicId] ?? null;
  }
  const list = await getProgressList(uid);
  return list.find((p) => p.comicId === comicId) ?? null;
}

export async function markCompleted(
  uid: string,
  data: {
    comicId: string;
    title: string;
    lastPageIndex: number;
    sourceRef: ComicSourceRef;
    coverUrl?: string;
  }
): Promise<void> {
  const completed: CompletedComic = {
    comicId: data.comicId,
    title: data.title,
    completedAt: new Date().toISOString(),
    lastPageIndex: data.lastPageIndex,
    sourceRef: data.sourceRef,
    ...(data.coverUrl ? { coverUrl: data.coverUrl } : {}),
  };

  if (!isFirebaseConfigured()) {
    const all = getLocalCompleted(uid);
    all[data.comicId] = completed;
    saveLocalCompleted(uid, all);
    const progress = getLocalProgress(uid);
    delete progress[data.comicId];
    saveLocalProgress(uid, progress);
    return;
  }

  await setDoc(
    doc(getFirebaseDb(), "users", uid, "completed", data.comicId),
    stripUndefined(completed as unknown as Record<string, unknown>)
  );
  await deleteDoc(doc(getFirebaseDb(), "users", uid, "progress", data.comicId));
}

export async function getCompletedList(uid: string): Promise<CompletedComic[]> {
  if (!isFirebaseConfigured()) {
    return Object.values(getLocalCompleted(uid)).sort((a, b) =>
      b.completedAt.localeCompare(a.completedAt)
    );
  }
  const snap = await getDocs(
    query(collection(getFirebaseDb(), "users", uid, "completed"), orderBy("completedAt", "desc"))
  );
  return snap.docs.map((d) => d.data() as CompletedComic);
}

export async function getRecentProgress(uid: string, count = 10): Promise<ReadingProgress[]> {
  const list = await getProgressList(uid);
  return list.slice(0, count);
}

export async function getRecentCompleted(uid: string, count = 10): Promise<CompletedComic[]> {
  const list = await getCompletedList(uid);
  return list.slice(0, count);
}
