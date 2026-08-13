# Daily Technical & Architectural Issues Log — August 13, 2026

---

## Issue 1: Tables Control Layout Responsive Alignment & Spacing Optimization

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Web Frontend Layout and Mobile Responsiveness Optimization |
| **Problems Identified** | In the Tables and Table Management pages, the primary zone switcher tabs and action buttons were clipping, overlapping, or getting cut off on mobile viewports. Specifically, characters like the "S" in the filter titles were cut off by panel borders due to missing padding, and switcher buttons were visually pressed against top borders. |
| **Resolution** | Refactored the zone switcher tabs to stack vertically (`flex-col`) and expand to full width (`w-full`) on mobile viewports (<640px) for cleaner touch targets, while preserving the horizontal flex-row behavior on larger screens. Standardized the grid/flex alignment of the entire control headers (switcher, headcount, status filters, action buttons) across both modules. Added `px-4` padding to inner control rows to prevent border text-clipping, and added `pt-3` top padding to shift switcher elements 3mm down from top borders. |
| **Activities Completed** | Rewrote flex layout classes and spacing parameters across Main Tables page and Admin Table Management component. Validated responsive stacking at mobile breakpoints and checked desktop MASTER preservation. Verified build stability by compiling the production bundle successfully. |
| **Files / Modules Updated** | `web-frontend/src/pages/TablesPage.tsx`, `web-frontend/src/components/admin/TableManagement.tsx` |

---

## Issue 2: Automatic Laptop Webcam QR Code Scanning & Full-Frame Optimization

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Live Webcam QR Code Auto-Scanning & Full-Frame Decoding Integration |
| **Problems Identified** | Initially, the camera viewfinders functioned as passive previews with no actual frame processing or QR decoding. After installing `jsQR`, the user interface still presented a restrictive centered square reticle guide, suggesting that users needed to align the QR code perfectly within the bounds to scan. |
| **Resolution** | Implemented an asynchronous loop (`requestAnimationFrame`) in `CheckInPage.tsx` and `BartenderPage.tsx` that captures active video feed frames onto an in-memory canvas, extracts image pixel data, and decodes QR codes automatically across the *entire visible camera frame* using the `jsQR` algorithm. Removed the restrictive `w-44`/`w-48` centered viewfinder target boxes from the UI and replaced them with futuristic, full-frame corner bracket border indicators. Updated the helper instruction to `"Place QR Code anywhere in the camera view"` to reflect thatcentering is no longer required. |
| **Activities Completed** | Integrated the `jsqr` package. Created full-frame capture loop, linked verification APIs, throttled duplicate scanning, and redesigned camera preview overlays. Verified successful production build compilation. |
| **Files / Modules Updated** | `web-frontend/package.json`, `web-frontend/src/pages/CheckInPage.tsx`, `web-frontend/src/pages/BartenderPage.tsx` |

---

## Issue 3: Guest Check-In State-Flow Correction, QR verification gate, and Incomplete Session Management

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Guest Check-In Wizard Workflow and Session Management |
| **Problems Identified** | The customer check-in wizard permitted manual bypasses of QR verification, triggered multiple duplicate email dispatches on page re-entry or double-clicks, and lacked a mechanism to resume or abandon incomplete sessions (forcing users to start over or get stuck in inconsistent wizard states). |
| **Resolution** | Refactored the Stage 2 to Stage 3 flow to require "Send QR" as the primary action. Disabled the "Proceed to Payment" button on Stage 3 until successful QR scan or manual token ID verification (blocking bypasses). Implemented `localStorage` state persistence for the incomplete wizard flow, displaying a resume/reset prompt on page mount. Added a "Close & Start New" reset action. |
| **Activities Completed** | Restructured navigation handlers, implemented localStorage persistence hooks, added button disabling gates, and successfully ran frontend compilation checks (`npm run build`). |
| **Files / Modules Updated** | `web-frontend/src/pages/CheckInPage.tsx`, `web-frontend/src/services/api.ts` |

---

## Issue 4: Seating Reservation & Concurrent Check-In Lock Lifecycle Enforcement

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Seating Table Reservation and Concurrency Check-In Lock Implementation |
| **Problems Identified** | The system lacked a dynamic table reservation lifecycle, allowing reserved tables to be checked in normally or duplicated. There was no backend-persisted check-in lock, which allowed concurrent receptionists to select, lock, and start check-in processes on the same table simultaneously, creating race conditions. |
| **Resolution** | Implemented backend-persisted table check-in locking endpoints (`POST /tables/:id/lock` and `POST /tables/:id/unlock`) utilizing an authoritative Redis metadata cache. Extended table status lifecycle to include `'in_checkin'`. Blocked direct manual status updates on locked tables. Updated the Check-In page table selection to execute atomic table locking, securing the new table before releasing the previous one, and automatically unlocking on abandonment or wizard reset. |
| **Activities Completed** | Created lock/unlock backend routes. Implemented state synchronization and table switching rules in frontend. Created a comprehensive integration test suite `reservation.test.ts` to verify concurrent locks and reservation state flows. Validated production build status and committed directly to `main` branch. |
| **Files / Modules Updated** | `backend/src/routes.ts`, `backend/src/services/TokenService.ts`, `backend/src/services/TableService.ts`, `backend/src/services/RedisService.ts`, `web-frontend/src/services/api.ts`, `web-frontend/src/pages/TablesPage.tsx`, `web-frontend/src/pages/CheckInPage.tsx`, `web-frontend/src/types/index.ts`, `backend/tests/reservation.test.ts` |

