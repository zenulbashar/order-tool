export default function VenueNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs font-bold uppercase tracking-wide text-label">
        404
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
        Venue not found
      </h1>
      <p className="mt-2 text-sm text-muted">
        We couldn’t find a storefront at this address. Check the link and try
        again.
      </p>
    </main>
  );
}
