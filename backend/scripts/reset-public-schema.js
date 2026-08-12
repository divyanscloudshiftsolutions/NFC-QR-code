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
  await c.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
    GRANT ALL ON SCHEMA public TO CURRENT_USER;
  `);
  console.log("Schema public reset.");
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
