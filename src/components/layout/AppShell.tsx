"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Clock,
  Library,
  LogOut,
  Settings,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/firebase/auth-context";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/library", label: "Library", icon: Library },
  { href: "/continue", label: "Continue", icon: Clock },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isReader = pathname.startsWith("/reader/");

  if (isReader) {
    return <div className="min-h-screen bg-black">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 lg:h-16">
          <Link href="/library" className="flex items-center gap-2 font-semibold">
            <BookOpen className="h-5 w-5 text-violet-400" />
            <span className="hidden sm:inline">Comic Reader</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  pathname === href
                    ? "bg-violet-600/20 text-violet-300"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <Link
              href="/admin/catalog"
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-violet-600/20 text-violet-300"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              )}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden text-sm text-zinc-400 lg:inline">
                {user.email ?? user.displayName}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-around py-2">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs",
                pathname === href ? "text-violet-400" : "text-zinc-500"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
