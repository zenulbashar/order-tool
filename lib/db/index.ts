import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// The neon-serverless driver speaks WebSocket. In Node we must supply a
// WebSocket implementation; `ws` is the documented choice. Setting this at
// module load does not open any connection.
neonConfig.webSocketConstructor = ws;

type Database = NeonDatabase<typeof schema>;

// Construct the pool + client once. Connections are lazy: neither `new Pool`
// nor `drizzle()` open a socket, so `next build` / `tsc` run without
// DATABASE_URL — the pool only dials Neon on the first query, by which point
// the runtime env is present. A pooled Neon endpoint also lets the
// neon-serverless driver run real interactive transactions (db.transaction).
function createDb(): Database {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return drizzle(pool, { schema });
}

// Reuse a single client across dev HMR reloads to avoid leaking pools.
const globalForDb = globalThis as unknown as { __orderToolDb?: Database };

export const db: Database = globalForDb.__orderToolDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__orderToolDb = db;
}
