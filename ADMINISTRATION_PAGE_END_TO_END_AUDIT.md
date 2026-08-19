# Administration Page End-to-End Architectural & Functional Audit

This document establishes a complete end-to-end audit of the Administration Page, covering frontend pages, components, data flows, APIs, middleware, backend routing, database tables, caching, browser storage, and security wrappers.

---

## 1. Audit Objective & Scope

The purpose of this audit is to identify the current structure, capabilities, dependencies, and synchronization states of the System Administration & Staff Portal module. It outlines the frontend-to-database tracing patterns, identifies architectural gaps/security mismatches, and defines the recommended alignment order for subsequent connection phases.

---

## 2. Administration Page Entry Point & Route Chain

The entry chain is traced through the following hierarchy:

```text
Login (LoginPage.tsx)
  ↓
Authentication Context (AuthContext.tsx)
  ↳ Writes: localStorage ('bar_web_token', 'bar_web_user')
  ↓
Tab Rendering Wrapper (App.tsx)
  ↳ Matches: activeTab.startsWith('admin')
  ↓
Administration Page Main Component (AdminPage.tsx)
  ↳ Guard: const isAuthorized = userRole === 'admin' || userRole === 'manager';
  ↓
Tab Selector (AdminNavTabs.tsx)
  ↳ Updates: activeTab (e.g., 'admin/tables', 'admin/staff', 'admin/chart', 'admin/rates', 'admin/customers')
  ↓
Active Tab Module (TableManagement | StaffManagement | RevenueAnalyticsChart | RateManagement | CustomerSessionsManager)
```

### Entry File Configurations
*   **Main Wrapper File Path**: [`web-frontend/src/pages/AdminPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/AdminPage.tsx)
*   **Main Component Name**: `AdminPage`
*   **Authentication Wrapper**: Auth Context (`useAuth()`), checking availability of the user object in memory (originating from `localStorage` under `bar_web_user`).
*   **Role/Permission Guard**: Block at the top of `AdminPage.tsx`:
    ```typescript
    const userRole = user?.role ? user.role.toLowerCase() : '';
    const isAuthorized = userRole === 'admin' || userRole === 'manager';
    ```
    If unauthorized, renders the `<ShieldAlert />` restricted warning.

---

## 3. Tab Inventory

The Administration page contains exactly 5 active modules toggled through `AdminNavTabs.tsx`:

| Tab Name | Tab ID / Key | Component | File Path | Visible Roles (FE) | Read/Write Status | Primary Dependencies |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tables Floor Plan** | `tables` | `TableManagement` | [`TableManagement.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/TableManagement.tsx) | Admin, Manager | Read & Write | `api.createTable`, `api.releaseTable`, `useData` Context (tables, tokens) |
| **Staff Directory** | `staff` | `StaffManagement` | [`StaffManagement.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/StaffManagement.tsx) | Admin, Manager | Read & Write | `api.createUser`, `api.updateUserStatus`, `useData` Context (users) |
| **Revenue Analytics** | `chart` | `RevenueAnalyticsChart` | [`RevenueAnalyticsChart.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/RevenueAnalyticsChart.tsx) | Admin, Manager | Read-Only | `api.getActiveTokens` |
| **Rate Cards** | `rates` | `RateManagement` | [`RateManagement.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/RateManagement.tsx) | Admin, Manager | Read & Write | `api.updateRateCard`, `useData` Context (rates) |
| **Customer Sessions** | `customers` | `CustomerSessionsManager` | [`CustomerSessionsManager.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/CustomerSessionsManager.tsx) | Admin, Manager | Read & Write | `api.closeToken`, `api.extendToken`, `useData` Context (allSessions) |

---

## 4. Component Tree & Hierarchy

The nested React component tree of the Administration workspace is structured as follows:

```text
AdminPage (AdminPage.tsx)
├── AdminNavTabs (AdminNavTabs.tsx)
└── Active Module Switcher
    ├── TableManagement (TableManagement.tsx)
    │   ├── SeatingRow (SeatingRow.tsx)
    │   │   └── TableDiagram (TableDiagram.tsx)
    │   └── Inspect Drawer (Modal View)
    │       └── TableDiagram (TableDiagram.tsx)
    ├── StaffManagement (StaffManagement.tsx)
    │   └── Register Staff Modal (Slide Drawer)
    ├── RevenueAnalyticsChart (RevenueAnalyticsChart.tsx)
    │   └── Custom HTML CSS Bar Chart
    ├── RateManagement (RateManagement.tsx)
    │   └── Edit Rate Card Modal (Slide Drawer)
    └── CustomerSessionsManager (CustomerSessionsManager.tsx)
        ├── View History / Details Modal
        ├── Admin Extend Session Modal
        └── Close Session Modal
```

### Unused / Orphaned Components
*   [`LiveDashboard.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/LiveDashboard.tsx): Defined in the admin components directory but never imported or referenced in `AdminPage.tsx` or any other router in the codebase.

---

## 5. API Client Inventory

The administration UI interacts with the backend strictly through the central axios/fetch API client defined in [`api.ts`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/services/api.ts).

```text
Frontend Action
      ↓
API Method in api.ts
      ↓
Request endpoint
      ↓
Authorization Header (Bearer Token)
```

### Expose APIs for Administration:
1.  **`createTable(tableData: { tableNumber: string; placeTypeId: string; capacity: number })`**:
    *   *Endpoint*: `POST /tables`
    *   *Payload*: `{ tableNumber, placeTypeId, capacity }`
2.  **`releaseTable(tableId: string)`**:
    *   *Endpoint*: `PUT /tables/${tableId}/release`
3.  **`createUser(userData: { username: string; fullName: string; pin: string; role: string })`**:
    *   *Endpoint*: `POST /auth/register`
4.  **`updateUserStatus(userId: string, isActive: boolean)`**:
    *   *Endpoint*: `PATCH /users/${userId}/status`
5.  **`updateRateCard(rateId: string, payload: { ratePerPerson: number; baseTimeMinutes: number; redemptionsPerPerson: number })`**:
    *   *Endpoint*: `PUT /config/rates/${rateId}`
6.  **`extendToken(tokenNumber: string, extraMinutes: number, amount: number, sendEmail: boolean, paymentMethod: string)`**:
    *   *Endpoint*: `PUT /tokens/${tokenNumber}/extend`
7.  **`closeToken(tokenNumber: string, reason?: string, reasonDetail?: string)`**:
    *   *Endpoint*: `PUT /tokens/${tokenNumber}/close`
8.  **`getAllSessions()`**:
    *   *Endpoint*: `GET /admin/sessions`
9.  **`getUsers()`**:
    *   *Endpoint*: `GET /users`
10. **`getRates()`**:
    *   *Endpoint*: `GET /rate-cards` (with fallback endpoints)
11. **`getTables()`**:
    *   *Endpoint*: `GET /tables`

---

## 6. Backend Route Mapping & Services

All administrative endpoints are configured in [`backend/src/routes.ts`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/backend/src/routes.ts):

### Route Definitions and Access
*   `POST /tables` -> Calls `prisma.table.create`.
    *   *Middleware*: `authenticate`, `authorize(['admin'])`
*   `PUT /tables/:tableId/release` -> Calls `tableService.releaseTable`.
    *   *Middleware*: `authenticate`, `authorize(['receptionist', 'admin'])`
*   `POST /auth/register` -> Calls federated external signup (if not test env) and creates local `User` via `prisma.user.create`.
    *   *Middleware*: `authenticate`, `authorize(['admin'])`
*   `GET /users` -> Queries local database.
    *   *Middleware*: `authenticate`, `authorize(['admin'])`
*   `PATCH /users/:id/status` -> Updates local status (`isActive`).
    *   *Middleware*: `authenticate`, `authorize(['admin'])`
*   `GET /admin/sessions` -> Triggers state reconciliation, then reads all token entries.
    *   *Middleware*: `authenticate`, `authorize(['admin', 'manager'])`
*   `PUT /config/rates/:id` (along with fallback routes `/rate-card/:id` and `/rate-cards/:id`) -> Updates `PlaceTypeConfig` and creates `RateLog` audit row.
    *   *Middleware*: `authenticate`, `authorize(['admin'])`
*   `PUT /tokens/:tokenNumber/extend` -> Extends duration using `tokenService.extendToken` and writes `SyncLog` for tracking.
    *   *Middleware*: `authenticate`, `authorize(['receptionist', 'admin', 'bartender'])`
*   `PUT /tokens/:tokenNumber/close` -> Standard checkout checkoutSessionHandler writing `SyncLog`.
    *   *Middleware*: `authenticate`, `authorize(['receptionist', 'admin', 'bartender'])`

---

## 7. Database Tracing & Models

Prisma models mapped in [`schema.prisma`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/backend/prisma/schema.prisma) that correspond with admin tables:

```text
Table (tables)
  ├── id (UUID Primary Key)
  ├── tableNumber (String)
  ├── capacity (Int)
  ├── status (String: 'available', 'occupied', 'reserved', 'maintenance')
  ├── currentTokenId (UUID -> relation Token)
  └── placeTypeId (UUID -> relation PlaceTypeConfig)

User (users)
  ├── id (UUID Primary Key)
  ├── username (String Unique)
  ├── passwordHash (String)
  ├── fullName (String)
  ├── roleId (UUID -> relation Role)
  └── isActive (Boolean)

PlaceTypeConfig (place_types)
  ├── id (UUID Primary Key)
  ├── name (String: 'STANDING_BAR', 'PREMIUM_LOUNGE')
  ├── ratePerPerson (Decimal)
  ├── baseTimeMinutes (Int)
  └── redemptionsPerPerson (Int)

Token (tokens)
  ├── id (UUID Primary Key)
  ├── tokenNumber (String Unique)
  ├── customerId (UUID -> relation Customer)
  ├── tableId (UUID Nullable -> relation Table)
  ├── amountPaid (Decimal)
  ├── status (Enum: ACTIVE, CLOSED, EXPIRED, EXTENDED, etc.)
  └── closedBy / closedAt / closeReason
```

---

## 8. Redis Cache Key Mapping

Administrative mutations invalidate several cache entries to keep views consistent:

| Cached Entity | Redis Key | Created / Read By | Invalidated By (Actions) |
| :--- | :--- | :--- | :--- |
| **Tables Inventory** | `tables:all` | `GET /tables` | Release Table, Create/Edit/Delete Table, Close Session |
| **Active Tokens** | `tokens:active` | `GET /tokens/active` | Extend Session, Close Session, Release Table, Check-In |
| **Place Types Rates** | `rates:all` | `GET /config/rates` | Update Rate Card |
| **Staff Users** | `users:all` | `GET /users` | Register Staff, Toggle User Status |
| **Available Tables By Type** | `table:available:${placeTypeId}` | Internal lock validations | Create Table, Delete Table, Edit Table, Lock Table, Unlock Table |

---

## 9. Browser Storage Usage

The Administration page relies on standard local storage keys checked at application startup:
*   `bar_web_active_tab`: Persists the active sub-tab view (e.g. `admin/staff` or `admin/rates`) across reloads.
*   `bar_web_user` & `bar_web_token`: Authorizes the administrative dashboard access.

---

## 10. Role/Permission Matrix (Code Discovered Mismatches)

Below is the matrix of **actual role permissions** implemented in the backend router compared to frontend UI availability:

| Action / Page / Tab | UI Visibility (FE) | Admin Allowed (BE) | Manager Allowed (BE) | Receptionist Allowed (BE) | Bartender Allowed (BE) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Access Admin Page** | ✅ Admin, Manager | — | — | — | — |
| **Create Table** | ✅ Admin, Manager | ✅ | ❌ (Forbidden) | ❌ | ❌ |
| **Release Table** | ✅ Admin, Manager | ✅ | ❌ (Forbidden) | ✅ | ❌ |
| **Register Staff** | ✅ Admin, Manager | ✅ | ❌ (Forbidden) | ❌ | ❌ |
| **View Staff Directory** | ✅ Admin, Manager | ✅ | ❌ (Fetch Block) | ❌ | ❌ |
| **Toggle Staff Status** | ✅ Admin, Manager | ✅ | ❌ (Forbidden) | ❌ | ❌ |
| **Update Rate Card** | ✅ Admin, Manager | ✅ | ❌ (Forbidden) | ❌ | ❌ |
| **Extend Token** | ✅ Admin, Manager | ✅ | ❌ (Forbidden) | ✅ | ✅ |
| **Close Token** | ✅ Admin, Manager | ✅ | ❌ (Forbidden) | ✅ | ✅ |
| **View Sessions** | ✅ Admin, Manager | ✅ | ✅ | ❌ | ❌ |

---

## 11. Cross-Page & Workflow Connections

The Admin configurations directly dictate seating options, rates, and shift authentication limits for other workstations:

```text
Admin: Rate Config (PlaceTypeConfig)
  ↓
Check-In: Rate selection cover charge calculations

Admin: Table Floor (Table)
  ↓
Tables Page & Check-In: Active table options for guest seating

Admin: Register Staff (User)
  ↓
Login page: Authenticates Receptionists, Bartenders, and Managers
```

---

## 12. UI-to-Database Trace Matrix

| Sub-Tab Module | UI Component | Action Triggered | Express Endpoint | Backend Handler | Target Prisma Model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tables Floor** | `TableManagement` | Add New Table | `POST /api/tables` | Inline route logic | `Table` |
| **Tables Floor** | `TableManagement` | Release Table | `PUT /api/tables/:id/release` | Inline route logic | `Table` & `TableOccupancyLog` |
| **Staff Directory** | `StaffManagement` | Confirm Create | `POST /api/auth/register` | Inline signup/bcrypt check | `User` |
| **Staff Directory** | `StaffManagement` | Activate/Deactivate | `PATCH /api/users/:id/status` | Inline update check | `User` |
| **Rate Cards** | `RateManagement` | Update Pricing | `PUT /api/config/rates/:id` | `updateRateCardHandler` | `PlaceTypeConfig` & `RateLog` |
| **Customer Sessions** | `CustomerSessionsManager` | Confirm Extension | `PUT /api/tokens/:tokenNumber/extend` | `extendSessionHandler` | `Token` & `TokenExtension` |
| **Customer Sessions** | `CustomerSessionsManager` | Confirm Closure | `PUT /api/tokens/:tokenNumber/close` | `checkoutSessionHandler` | `Token` |

---

## 13. Data Refresh & Synchronization

*   **Initialization**: Rates, Users, Tables, and Sessions are retrieved on component mount by calling `refreshRates()`, `refreshUsers()`, `refreshTables()`, and `refreshAllSessions()` respectively.
*   **Active Sync**: The background sync loop in `DataContext.tsx` runs every 3 seconds, fetching active tables (`tables`) and reservations (`reservations`).
*   **Stale Data Risks**:
    1.  `CustomerSessionsManager` fetches the complete list of sessions via `refreshAllSessions` *only* on tab mount or manual sync button click. Changes made by receptionists checking out guests on the Tables Page do not automatically reflect on the Sessions list until a manual refresh is executed.
    2.  `StaffManagement` user directories are fetched *only* on mount. Status modifications made on a concurrent admin workstation will remain outdated.

---

## 14. Found Mismatches, Orphans, and Risks

### A. Correct / Aligned
*   Theme loading, navigation tabs switching, and general session token persistence operate correctly and compile without errors.

### B. UI ↔ API Mismatch
*   The `RevenueAnalyticsChart.tsx` exports active tokens in CSV correctly but displays hourly revenue breakdowns using a **hardcoded static array** (`hourlyData` starting at 6 PM). The chart is purely decorative and does not represent database revenue records.

### C. API ↔ Database Mismatch
*   There are backend controllers for updating a table (`PUT /tables/:id`) and deleting a table (`DELETE /tables/:id`), but these capabilities are not defined in the API client or accessible through the `TableManagement` frontend interface.

### D. Permission Mismatch (Critical Risk)
*   **Manager Role Lockdown**: The frontend authorizes Managers to view the entire AdminPage. However, almost all administrative mutation endpoints (creating tables, registering staff, toggling status, updating rates, extending tokens, and closing sessions) are restricted strictly to `'admin'` or receptionist roles.
    *   Managers clicking "Confirm Table" will get an `HTTP 403 Forbidden` response from `POST /tables`.
    *   Managers clicking "Confirm Extension" will get an `HTTP 403 Forbidden` response from `PUT /tokens/:tokenNumber/extend`.
    *   Managers accessing the "Staff Directory" tab will not see any users because `refreshUsers` is guarded with `if (user?.role?.toLowerCase() !== 'admin') return;` on the frontend.

---

## 15. Recommended Alignment Order

For the next implementation phase, we recommend taking the Administration page tab-by-tab to resolve role permissions, correct static charts, and implement missing actions:

```text
Revenue Analytics (Tab 1)
  ↓
Replace static hourlyData with dynamic calculations from tokens database query
  ↓
Customer Sessions (Tab 2)
  ↓
Align backend endpoints (/extend and /close) to permit the 'manager' role
  ↓
Table Management (Tab 3)
  ↓
Expose Delete Table / Edit Table actions in frontend UI using PUT/DELETE endpoints
Align releaseTable backend middleware to authorize the 'manager' role
  ↓
Rate Cards (Tab 4)
  ↓
Align rate-card updates to permit the 'manager' role on the backend
  ↓
Staff Directory (Tab 5)
  ↓
Expose fetchUsers capability to Managers if required, or update frontend visibility
```

---

## 16. Structural Architecture Diagram

```text
                       ADMINISTRATION PAGE
                                │
          ┌─────────────┬───────┴─────┬──────────────┐
          ↓             ↓             ↓              ↓
        Tables        Staff         Rates        Sessions
          │             │             │              │
      TableMgmt     StaffMgmt     RateMgmt      CustSessMgr
          │             │             │              │
          └─────────────┼─────────────┼──────────────┘
                        ↓
                    API Client (api.ts)
                        ↓
            Express Routes (routes.ts)
                        ↓
         Authentication & Role Authorization
            - Admin (Full CRUD access)
            - Manager (FE visible, FE/BE blocked on mutations)
                        ↓
                   Controllers
                        ↓
            Prisma Schema / DB Services
             ↙          ↓          ↘
       PostgreSQL     Redis       Audit Logs
     (Tables/Users)  (Caches)    (Rate/SyncLogs)
```
