import Link from "next/link";

import { requireUser, requireVenue } from "@/lib/tenant";

import { ImportClient } from "./import-client";

export default async function ImportMenuPage() {
  await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="border-b border-gray-200 pb-6">
        <Link
          href="/dashboard/menu"
          className="text-xs text-gray-500 hover:text-gray-900"
        >
          ← Back to menu
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Import menu from photo
        </h1>
        <p className="text-sm text-gray-500">{venue.name}</p>
      </header>

      <ImportClient />
    </main>
  );
}
