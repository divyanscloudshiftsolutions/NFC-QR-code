# Daily Technical & Architectural Issues Log — August 12, 2026

---

## Issue 1: Light Theme Background Asset Integration

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Web Frontend Theme Standardization |
| **Problems Identified** | The light theme was missing its designated background assets, causing structural inconsistency compared to the complete dark theme layout. |
| **Resolution** | Imported the user-provided light theme background image and integrated it as the designated light theme backdrop without altering the previously established border and glass structural rules. |
| **Activities Completed** | Processed the uploaded asset, saved it to the master `UIUX` references as `light theme.jpg`, and updated `web-frontend/public/login_bg_light.png` for application consumption. |
| **Files / Modules Updated** | `UIUX/web UIUX/light theme.jpg`, `web-frontend/public/login_bg_light.png` |

---

## Issue 2: Security & Production Readiness Refactoring

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Core Backend Security and Infrastructure Hardening |
| **Problems Identified** | The system contained critical blockers for production deployment: a destructive database seed script that could wipe operational data, exposed hardcoded database credentials in utility scripts, an insecure fallback for JWT secrets, and overly permissive pattern-matching in the CORS policy. |
| **Resolution** | Refactored the `seed.ts` script to remove all transactional data wipes. Purged all hardcoded credentials from utility scripts in favor of `process.env.DATABASE_URL`. Replaced the JWT fallback with a strict fast-fail mechanism if the secret is missing. Replaced permissive CORS `includes()` matching with strict explicit origin allowlisting. |
| **Activities Completed** | Modified database interaction logic, updated authentication requirements, enforced strict CORS origin validation, removed hardcoded secrets, and verified that these backend security adjustments preserved full frontend API functional integrity without impacting the UI/UX workflows. |
| **Files / Modules Updated** | `backend/prisma/seed.ts`, `backend/scripts/copy-neon-to-local.js`, `backend/scripts/inspect-db.js`, `backend/scripts/reset-public-schema.js`, `backend/src/routes.ts`, `backend/src/server.ts` |

---

## Issue 3: Test Data Purge and Data Source Discrepancy Resolution

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Database Hygiene & Frontend State Synchronization |
| **Problems Identified** | 1. Accumulation of E2E transactional test data that needed safe removal without disrupting master configurations.<br>2. A perceived desynchronization where the UI displayed ghost occupied tables despite a clean database, caused by an un-invalidated backend memory cache and active frontend mock data fallback. |
| **Resolution** | Safely purged E2E transactional test data directly via a strict Prisma $transaction. Restarted the Node.js backend to drop stale RedisService in-memory mock cache. Most importantly, disabled a hardcoded mock data fallback (useMockFallback = false) in the React web frontend that was injecting fake table occupancy states regardless of the API response. |
| **Activities Completed** | Audited the PostgreSQL database to verify exactly 0 test tokens and 0 occupied tables remained. Investigated Express API headers and browser HTTP caching behavior. Removed useMockFallback bypass logic in TablesPage.tsx. |
| **Files / Modules Updated** | web-frontend/src/pages/TablesPage.tsx, Local PostgreSQL Database |

---

## Issue 4: Dark Theme Text Visibility and Contrast Enhancement

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | UI Accessibility and Visual Clarity Optimization |
| **Problems Identified** | Secondary text elements, form labels (e.g., "Phone Number"), and placeholders were visually faint and blended into the `#1E1E1E` dark surface background, severely impacting readability in Dark Mode. |
| **Resolution** | Conducted a system-wide audit of CSS design tokens and inline Tailwind opacities. Brightened the global dark theme text variables (`--text-secondary`, `--text-muted`, `--text-placeholder`) in `index.css` to WCAG-compliant values (`#D4D4D8`, `#A1A1AA`, etc.). Replaced excessive inline opacity modifiers (e.g., `text-text-muted/60`) with solid muted colors across affected components. Light theme tokens and UI structures were strictly preserved. |
| **Activities Completed** | Upgraded global CSS variables for dark mode, refactored inline text opacity across forms and navigation, and verified full production build success with 0 errors. |
| **Files / Modules Updated** | `web-frontend/src/styles/index.css`, `web-frontend/src/components/admin/TableManagement.tsx`, `web-frontend/src/components/layout/Header.tsx`, `web-frontend/src/pages/CheckInPage.tsx`, `web-frontend/src/App.tsx` |

---

## Issue 5: Responsive Layout Corrections for Tables UI

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Mobile Responsiveness and Layout Stabilization |
| **Problems Identified** | The top navigation tabs (Standard / Premium zones) and layout action buttons ("Refresh Data", "Add New Table") in the Tables and Admin Tables modules were overflowing horizontally on narrow mobile viewports due to strict flex row constraints and `whitespace-nowrap`. |
| **Resolution** | Restructured the top layout containers. In the main Tables view, the tabs wrapper was upgraded to an `overflow-x-auto` horizontal scroll block, preventing forced page expansion. In the Admin view, the action buttons were placed into a 50/50 responsive grid (`grid-cols-2`) for small screens, gracefully degrading back to a flex layout on tablet/desktop. |
| **Activities Completed** | Rewrote Tailwind flex box constraints and grid parameters on the two specific pages, resolving viewport horizontal overflow without altering the approved desktop Master design layout or modifying unrelated pages. |
| **Files / Modules Updated** | `web-frontend/src/pages/TablesPage.tsx`, `web-frontend/src/components/admin/TableManagement.tsx` |
