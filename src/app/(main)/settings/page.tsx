"use client";

import { Suspense } from "react";
import SettingsPageContent from "./SettingsPageContent";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-zinc-500">Loading...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
