# Daily Technical & Architectural Issues Log — August 18, 2026

---

## Issue 1: Strict Concurrency & Role-Isolated Table Locking

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Multi-user table lock concurrency and role-isolated check-in draft state management |
| **Problems Identified** | Admin and Receptionist users could concurrently see, select, and start check-in on the same table because locking status was not authoritatively checked on subsequent actions. Furthermore, incomplete check-in draft state stored in localStorage was shared globally, leaking active drafts across different user roles/logins in the same browser. Finally, the slow 10-second data sync interval delayed table state visibility updates on other receptionists' screens. |
| **Resolution** | Refactored localStorage draft keys in `CheckInPage.tsx` and `TablesPage.tsx` to include the current `user.id` (`bar_incomplete_checkin_${userId}`, etc.), isolating active wizard drafts to each logged-in user. Updated `assignTableToToken` in `TableService.ts` and `createToken`/`activatePendingSession` in `TokenService.ts` to retrieve and verify Redis lock ownership against the requester's `userId`, rejecting concurrent actions from other users with clear conflict error toasts. Removed raw SQL typecasts (`::uuid`) from table query parameters in `TableService.ts` to ensure compatibility across database schemas. Reduced the data context sync polling rate from 10 seconds to 3 seconds for fast updates. |
| **Activities Completed** | Modified localStorage state handling, added Redis lock ownership checks, verified multi-user conflict rejection endpoints, and completed concurrency testing with separate private sessions. Verified project compilation and production building. |
| **Files / Modules Updated** | `web-frontend/src/pages/TablesPage.tsx`, `web-frontend/src/pages/CheckInPage.tsx`, `web-frontend/src/context/DataContext.tsx`, `backend/src/services/TableService.ts`, `backend/src/services/TokenService.ts`, `backend/src/routes.ts` |

---

## Issue 2: Keyboard-First ENTER-key Support for Manual Token Verification

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Keyboard-first navigation and mouse-free form submission support |
| **Problems Identified** | Stage 3 manual token input inside Check-In had no native form container or keyboard event listener. Receptionists were forced to manually click the "Verify Token" button using the mouse to progress, interrupting high-speed keyboard data entry. |
| **Resolution** | Attached a custom `onKeyDown` event listener directly to the Stage 3 manual token `<input>` in `CheckInPage.tsx`. Pressing ENTER now triggers the verification action `handleVerifyQR(qrCodeInput)`. The implementation ensures that validation is checked (non-empty code) and that duplicate submission requests are strictly blocked while verification is in progress (`!isVerifyingQr`). |
| **Activities Completed** | Added input event listener in `CheckInPage.tsx`, verified ENTER key behavior on manual text input, validated duplicate press resistance, and verified build output. |
| **Files / Modules Updated** | `web-frontend/src/pages/CheckInPage.tsx` |

---

## Issue 3: End-to-End Workstation Authentication & Validation Regression Testing

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Comprehensive system-wide authentication, user role verification, and capacity warning checks |
| **Problems Identified** | Detailed verification was required to confirm that non-admin login rejections, capacity warnings, direct assignment lifecycles, and multi-user lock conflicts function correctly and authoritatively across the entire system. |
| **Resolution** | Executed 28 test cases covering login (Admin, Manager, Receptionist, Bartender), capacity validations, draft isolations, concurrency collisions, and manual token entry behaviors. Updated `api.ts` request interceptor to exclude `403 Forbidden` statuses from the session-expiry key eviction list. Token/user keys are now only evicted on explicit `401 Unauthorized` responses, letting the frontend correctly render normal access restrictions/toasts instead of forced reloads. |
| **Activities Completed** | Ran integration scripts and verified correct state rollbacks in PostgreSQL/Redis. Verified that valid Admin, Manager, Receptionist, and Bartender credentials work correctly after the authentication correction. Verified zero TypeScript compiler or Vite build errors. |
| **Files / Modules Updated** | `web-frontend/src/pages/CheckInPage.tsx`, `web-frontend/src/pages/TablesPage.tsx`, `web-frontend/src/services/api.ts`, `backend/src/services/TableService.ts`, `backend/src/services/TokenService.ts` |
