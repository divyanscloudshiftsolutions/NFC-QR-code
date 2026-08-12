const { Client } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL environment variable.");
    process.exit(1);
  }
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await c.connect();
  const r = await c.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY 1,2
  `);
  console.log("tables:", r.rows);
  try {
    const m = await c.query(
      `SELECT migration_name, finished_at FROM _prisma_migrations`
    );
    console.log("migrations:", m.rows);
  } catch (e) {
    console.log("migrations error:", e.message);
  }
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
