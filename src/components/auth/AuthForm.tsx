"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/firebase/auth-context";

interface AuthFormProps {
  mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle, firebaseEnabled } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      router.push("/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === "login" ? "Sign in" : "Create account"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-zinc-400">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-zinc-400">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!firebaseEnabled && (
            <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300">
              Firebase is not configured. Demo mode: any email/password will work locally.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Sign up"}
          </Button>
          {firebaseEnabled && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() =>
                void signInWithGoogle()
                  .then(() => router.push("/library"))
                  .catch((err: Error) => setError(err.message))
              }
            >
              Continue with Google
            </Button>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          {mode === "login" ? (
            <>
              No account?{" "}
              <Link href="/signup" className="text-violet-400 hover:underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-violet-400 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
