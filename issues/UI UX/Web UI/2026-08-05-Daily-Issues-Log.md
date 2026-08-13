# Daily Issues Log — August 5, 2026

---

## Issue 1: Project Renaming and Decommission of Legacy NFC Smart Card Services

| Attribute | Details |
| :--- | :--- |
| **Problem** | The repository, backend database services, web-frontend configs, React Native features, and technical documentation contained legacy "NFC" smart card pair codes, configurations, and inventory checks. |
| **Solution** | Renamed the project to "Bar Management System" (purging "NFC" references). Deleted the native NFC manager module under `frontend/src/services/nfc`. Bypassed NFC pairing steps in `CheckInWizard.tsx`, and changed backend API routes to restrict smart card operations. |
| **Outcome** | Monorepo and mobile package builds compile successfully with zero warnings or errors. |

---

## Issue 2: High-Fidelity Seating Floor Plan State Mapping

| Attribute | Details |
| :--- | :--- |
| **Problem** | Table status indicators in the table floor grids were limited to binary representations and did not reflect the four-state color hierarchy (Available, Occupied, Reserved, Maintenance) detailed in the Design System kit. |
| **Solution** | Refactored `TablesPage.tsx` and `TableManagement.tsx` to dynamically query and apply style class indicators for all four statuses: Green for Available, Purple for Occupied, Orange for Reserved, and Neutral Gray for Maintenance/Locked. |
| **Outcome** | Live seating maps and seats fill animations reflect precise venue states in absolute compliance with design mockups. |

---

## Issue 3: Premium UI Design System, Glassmorphism Sidebar & Button Aesthetics

| Attribute | Details |
| :--- | :--- |
| **Problem** | The application shell and primary buttons lacked a centralized light/dark design token system, premium translucent glass effects, ambient depth, or tactile click feedback. |
| **Solution** | Established CSS variables inside `index.css` for light/dark frosted glass panels (`rgba(255, 255, 255, 0.25)` in light, `rgba(15, 15, 15, 0.35)` in dark) under `backdrop-blur-xl`. Placed ambient blurred gradient backdrop orbs behind the viewport. Updated `.primary-btn` styling classes with top-edge inset reflections, translation hover lift (`translateY(-1px)`), and active compression scaling (`scale(0.98)`). Refined global typography heading letter and word spacing. |
| **Outcome** | App shell and buttons behave like a high-end desktop application with responsive hover/click ease-in-out haptics. |

---

## Issue 4: Navigation Architecture, Viewport Lock & Routing State Synchronization

| Attribute | Details |
| :--- | :--- |
| **Problem** | Visual layout elements overflowed (such as the Sign Out button), sidebar category submenus failed to navigate or synchronize states with content panels, and permissions did not accurately restrict Manager role access. |
| **Solution** | Restructured sidebar flex hierarchy using `flex-1 min-h-0` parameters, locking Sign Out at the bottom. Positioned center alignment configurations for collapsed icons. Configured custom `storage` event listeners inside `AdminPage.tsx` and `TablesPage.tsx` to sync category tabs immediately. Restricted Check-In page visibility to Admin/Receptionist roles, and authorized Manager role access to all Administration features. Styled active wizard circles with beverage quota amber colors (`amber-700` / `amber-300`) under subtle contained shadow glows (`shadow-[0_0_8px]`). |
| **Outcome** | End-to-end interface layout, role-based navigation flow, and routing states function with 100% synchronization and zero regressions. |
