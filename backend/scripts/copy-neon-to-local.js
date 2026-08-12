/**
 * One-off: copy all public tables from Neon -> local nfcregistry.
 * Usage: node scripts/copy-neon-to-local.js
 */
const { Client } = require("pg");

const SOURCE_URL = process.env.NEON_DATABASE_URL;
const TARGET_URL = process.env.LOCAL_DATABASE_URL;

if (!SOURCE_URL || !TARGET_URL) {
  console.error("Missing NEON_DATABASE_URL or LOCAL_DATABASE_URL environment variable.");
  process.exit(1);
}

// Parent tables first (FK-safe insert order)
const TABLES = [
  "roles",
  "place_types",
  "customers",
  "system_configs",
  "sync_logs",
  "role_change_logs",
  "users",
  "tables",
  "tokens",
  "cards",
  "redemptions",
  "token_extensions",
  "table_occupancy_logs",
  "rate_logs",
  "staff_sessions",
];

async function main() {
  const source = new Client({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
  const target = new Client({ connectionString: TARGET_URL });

  console.log("Connecting to Neon (source)...");
  await source.connect();
  console.log("Connecting to local (target)...");
  await target.connect();

  try {
    await target.query("BEGIN");
    await target.query("SET session_replication_role = replica");

    // Clear existing app data (keep _prisma_migrations)
    for (const table of [...TABLES].reverse()) {
      await target.query(`TRUNCATE TABLE "${table}" CASCADE`);
      console.log(`Truncated ${table}`);
    }

    for (const table of TABLES) {
      const { rows } = await source.query(`SELECT * FROM "${table}"`);
      if (rows.length === 0) {
        console.log(`${table}: 0 rows (skip)`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `"${c}"`).join(", ");
      let inserted = 0;

      for (const row of rows) {
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const values = columns.map((c) => row[c]);
        await target.query(
          `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
          values
        );
        inserted++;
      }

      console.log(`${table}: copied ${inserted} rows`);
    }

    await target.query("SET session_replication_role = DEFAULT");
    await target.query("COMMIT");
    console.log("\nData migration complete.");
  } catch (err) {
    await target.query("ROLLBACK").catch(() => {});
    console.error("\nMigration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main();
