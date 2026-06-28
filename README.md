# NFC & Email QR Bar System Management

An end-to-end event bar management system featuring dual check-in options: physical **NFC Smart Cards** and cardless **Email QR Tickets**. This application includes offline-first synchronization capabilities, automatic checkout systems, real-time table utilization metrics, and staff role management.

## Project Structure

```
├── backend/            # Express, Node.js, Prisma, PostgreSQL, Redis, MinIO S3
├── frontend/           # React Native, Expo, NativeWind/Tailwind, Safe Area Context
├── openapi.yaml        # API Specifications & Endpoint Contracts
├── workflow.md         # Full E2E System Workflow Diagrams & Sequence Rules
└── README.md           # Getting Started & Deployment Guide
```

---

## Technical Stack

### Backend
* **Core**: Node.js, Express, TypeScript
* **Database**: PostgreSQL (Prisma ORM)
* **Caching & Sequences**: Redis
* **Audit Trails Storage**: MinIO / S3 Object Storage
* **Testing**: E2E Integration Test Suites (`ts-node`)

### Frontend
* **Core**: React Native, TypeScript, Expo
* **Layouts & Styling**: NativeWind (Tailwind CSS), React Native Safe Area Context
* **Auto-IP Resolution**: Dynamic Metro source modules mapping local endpoints automatically for physical debugging

---

## Production Deployment on Railway

### 1. Environment Setup
Configure the following environment variables in your Railway dashboard:
* `DATABASE_URL`: PostgreSQL connection string.
* `REDIS_URL`: Redis connection string.
* `JWT_SECRET`: Secret key for signature validations.
* `NODE_ENV`: `"production"`
* `FRONTEND_URL`: URL of the deployed client interface.
* **SMTP Config** (for QR delivery): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### 2. Deployment Sequence
Railway builds and launches the container automatically using the following steps:
1. `npm install` (Installs both standard and development dependencies)
2. `npm run build` (Generates Prisma Client binaries and compiles TypeScript into `dist/`)
3. `npm run start` (Deploys pending PostgreSQL migrations using `prisma migrate deploy` and boots the Express server)
