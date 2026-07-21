// Test stub for the `server-only` package. The real module throws when imported
// outside a React Server Component; under Vitest (plain Node) we alias it here so
// pure functions co-located in "server-only" modules (e.g. inclusiveTaxCents in
// lib/payments/tax.ts) can be unit-tested in isolation.
export {};
