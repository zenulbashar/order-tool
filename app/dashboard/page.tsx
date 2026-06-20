import { signOut } from "@/lib/auth";
import { requireUser, requireVenue } from "@/lib/tenant";

export default async function DashboardPage() {
  const user = await requireUser();
  const venue = await requireVenue();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-start justify-between gap-4 border-b border-gray-200 pb-6">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-gray-500">Venue</p>
          <h1 className="text-2xl font-semibold tracking-tight">{venue.name}</h1>
          <p className="text-sm text-gray-500">
            /{venue.slug} · {venue.timezone}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="py-10">
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm font-medium text-gray-900">Your venue is ready.</p>
          <p className="mt-1 text-sm text-gray-500">
            Menus, storefront, and ordering arrive in later phases.
          </p>
        </div>
        <p className="mt-6 text-xs text-gray-400">Signed in as {user.email}</p>
      </section>
    </main>
  );
}
