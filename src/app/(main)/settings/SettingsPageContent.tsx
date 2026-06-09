"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/firebase/auth-context";
import { SUPPORTED_LANGUAGES } from "@/types/translation";

export default function SettingsPageContent() {
  const { user, settings, updateSettings, getIdToken, firebaseEnabled } = useAuth();
  const searchParams = useSearchParams();
  const [teraboxNdus, setTeraboxNdus] = useState("");
  const [teraboxJsToken, setTeraboxJsToken] = useState("");
  const [teraboxComicsDir, setTeraboxComicsDir] = useState("/Comics");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) setMessage(`Connected: ${connected}`);
    if (error) setMessage("Connection failed. Please try again.");
  }, [searchParams]);

  const connectGoogleDrive = async () => {
    if (!firebaseEnabled) {
      setMessage("Google Drive requires Firebase configuration.");
      return;
    }
    setConnecting(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/cloud/google/connect", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    } catch {
      setMessage("Failed to start Google Drive connection.");
    } finally {
      setConnecting(false);
    }
  };

  const connectTerabox = async () => {
    setConnecting(true);
    setMessage("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/cloud/terabox/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ndus: teraboxNdus,
          jsToken: teraboxJsToken || undefined,
          appId: "250528",
          comicsDir: teraboxComicsDir,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        message?: string;
        indexed?: number;
      };
      if (res.ok) {
        setMessage(
          `Terabox connected. ${data.message ?? ""} Indexed ${data.indexed ?? 0} comics.`
        );
      } else {
        setMessage(data.error ?? "Terabox connection failed.");
      }
    } catch {
      setMessage("Terabox connection failed.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold lg:text-3xl">Settings</h1>
        <p className="text-sm text-zinc-500">Reading preferences and cloud connections</p>
      </div>

      {message && (
        <div className="rounded-lg bg-violet-500/10 px-4 py-3 text-sm text-violet-300">{message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Translation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="targetLang" className="mb-1 block text-sm text-zinc-400">
              Target language
            </label>
            <select
              id="targetLang"
              value={settings.targetLang}
              onChange={(e) => void updateSettings({ targetLang: e.target.value })}
              className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.translationEnabled}
              onChange={(e) => void updateSettings({ translationEnabled: e.target.checked })}
              className="h-4 w-4 accent-violet-500"
            />
            <span className="text-sm">Enable auto-translation while reading</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.wifiOnlyTranslation}
              onChange={(e) => void updateSettings({ wifiOnlyTranslation: e.target.checked })}
              className="h-4 w-4 accent-violet-500"
            />
            <span className="text-sm">Translate on Wi-Fi only</span>
          </label>

          <div>
            <label htmlFor="fontSize" className="mb-1 block text-sm text-zinc-400">
              Overlay font size: {settings.overlayFontSize}px
            </label>
            <input
              id="fontSize"
              type="range"
              min={10}
              max={24}
              value={settings.overlayFontSize}
              onChange={(e) => void updateSettings({ overlayFontSize: Number(e.target.value) })}
              className="w-full accent-violet-500"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="direction" className="mb-1 block text-sm text-zinc-400">
              Reading direction
            </label>
            <select
              id="direction"
              value={settings.readingDirection}
              onChange={(e) =>
                void updateSettings({ readingDirection: e.target.value as "ltr" | "rtl" })
              }
              className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm"
            >
              <option value="ltr">Left to right (Western)</option>
              <option value="rtl">Right to left (Manga)</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terabox Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-zinc-800/50 p-3 text-sm text-zinc-400">
            <p className="mb-2 font-medium text-zinc-300">How to get credentials:</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Open <strong className="text-zinc-200">terabox.com</strong> and log in.</li>
              <li>Press F12 → Application → Cookies → copy the <strong className="text-zinc-200">ndus</strong> value.</li>
              <li>Optional: Network tab → filter <strong className="text-zinc-200">list</strong> → copy <strong className="text-zinc-200">jsToken</strong> from the request URL (helps if auto-fetch fails).</li>
              <li>Set comics folder to <strong className="text-zinc-200">/Comics</strong> if your comics are in that folder.</li>
            </ol>
            <p className="mt-2 text-amber-400/90">Credentials expire — reconnect when comics stop loading.</p>
          </div>
          <div className="space-y-2">
            <Input
              placeholder="ndus cookie (required)"
              value={teraboxNdus}
              onChange={(e) => setTeraboxNdus(e.target.value)}
            />
            <Input
              placeholder="jsToken (optional — copied from Network tab list request)"
              value={teraboxJsToken}
              onChange={(e) => setTeraboxJsToken(e.target.value)}
            />
            <Input
              placeholder="Comics folder path"
              value={teraboxComicsDir}
              onChange={(e) => setTeraboxComicsDir(e.target.value)}
            />
            <Button onClick={() => void connectTerabox()} disabled={connecting || !teraboxNdus.trim()}>
              {connecting ? "Connecting..." : "Connect Terabox & Index Comics"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {user && (
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-400">{user.email}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
