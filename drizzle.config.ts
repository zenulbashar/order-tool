import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load local env for `npm run db:*`. In CI the vars are injected directly,
// and a missing .env.local here is a harmless no-op.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // For migrations, prefer the DIRECT (non-pooled) Neon URL. See README.
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
