export default function VenueNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
        Venue not found
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        We couldn’t find a storefront at this address. Check the link and try
        again.
      </p>
    </main>
  );
}
