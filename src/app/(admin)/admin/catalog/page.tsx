"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/firebase/auth-context";

export default function AdminCatalogPage() {
  const { getIdToken } = useAuth();
  const [folderId, setFolderId] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState<string>("");

  const runIndex = async (action: "index_drive" | "index_terabox" | "index_all") => {
    setIndexing(true);
    setResult("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/index", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, folderId: folderId || undefined }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Index failed");
    } finally {
      setIndexing(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold lg:text-3xl">Admin Catalog</h1>
        <p className="text-sm text-zinc-500">
          Index comics from Google Drive and Terabox into the shared library
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Google Drive Index</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Google Drive folder ID (or use GOOGLE_DRIVE_FOLDER_ID env)"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          />
          <Button onClick={() => void runIndex("index_drive")} disabled={indexing}>
            Index Google Drive
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terabox Index</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-zinc-400">
            Uses TERABOX_NDUS, TERABOX_JS_TOKEN, and TERABOX_APP_ID from environment.
          </p>
          <Button onClick={() => void runIndex("index_terabox")} disabled={indexing}>
            Index Terabox
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Index All Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => void runIndex("index_all")} disabled={indexing}>
            Index All
          </Button>
        </CardContent>
      </Card>

      {result && (
        <pre className="overflow-auto rounded-lg bg-zinc-900 p-4 text-xs text-zinc-300">{result}</pre>
      )}
    </div>
  );
}
