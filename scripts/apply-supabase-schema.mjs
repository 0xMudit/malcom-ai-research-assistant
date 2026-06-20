import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const schemaPath = "supabase/schema.sql";

if (!databaseUrl) {
  console.error(
    "Set SUPABASE_DB_URL or DATABASE_URL to apply supabase/schema.sql automatically.",
  );
  process.exit(2);
}

if (!existsSync(schemaPath)) {
  console.error(`${schemaPath} was not found.`);
  process.exit(1);
}

const result = spawnSync(
  "psql",
  [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", schemaPath],
  {
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
