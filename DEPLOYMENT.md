# Production Deployment & Migration Baselines

This guide outlines the steps to deploy the backend API to a production environment (such as Railway) when connecting to an existing production database (such as Neon PostgreSQL) that already has pre-existing tables.

---

## 1. The Baselining Problem (Prisma Error P3005)

When deploying to a database that already has tables, Prisma's `prisma migrate deploy` command fails with:
> `Error: P3005: The database schema is not empty. Need to baseline an existing production database.`

This happens because the database contains tables, but the migration tracking table (`_prisma_migrations`) in your production database is either empty or does not record the initial schema setup.

---

## 2. The Solution: Baselining the Initial Migration

To fix this, you must tell Prisma that the initial schema setup migration has already been applied, so it does not attempt to create the tables again.

### Step 1: Run the Baseline Command
Set your shell's `DATABASE_URL` environment variable to point to your live production Neon database, and run:

```bash
npx prisma migrate resolve --applied 20260617124358_init
```

**What this does**: It inserts a record for the migration `20260617124358_init` into the `_prisma_migrations` table, marking it as successfully applied without running any SQL statements that would try to recreate the existing tables.

### Step 2: Automatic Future Migrations
Once the database is baselined, any future updates you deploy will be handled automatically by the Railway startup task:

```json
"start": "prisma migrate deploy && node dist/server.js"
```

When new migration files are created in `backend/prisma/migrations/`, Prisma will detect and apply them to the Neon database automatically on startup.

---

## 3. Production Environment Variables Checklist

Ensure these variables are set under the **Variables** tab on your Railway Dashboard:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Your production Neon PostgreSQL connection string |
| `REDIS_URL` | Your production Railway Redis connection string |
| `JWT_SECRET` | A secure, random string for signing access tokens |
| `NODE_ENV` | Set to `"production"` |
| `PORT` | Managed automatically by Railway (do not override) |
| `FRONTEND_URL` | The deployed web or staging domain for CORS policies |
