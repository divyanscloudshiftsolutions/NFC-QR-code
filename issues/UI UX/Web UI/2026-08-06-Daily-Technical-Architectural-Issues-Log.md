# Daily Technical & Architectural Issues Log — August 6, 2026

---

## Issue 1: Global UI Interaction Hierarchy & Button Design System Standardization

| Attribute | Details |
| :--- | :--- |
| **Problem** | Buttons, tabs, and page filters across the application had inconsistent hover animations, color palettes, and icon badging. Several secondary actions (such as camera scanner toggles and close dialogs) lacked standard semantic colors or used solid purple/red fills incorrectly. |
| **Solution** | Standardized all UI controls to follow the Sidebar navigation interaction standard. Applied `.nav-icon-badge` rounded glass containers to all leading icons in buttons and tabs. Unified semantic button styling: Brand Purple for primary actions, Emerald Green for camera scanner activation, and Subtle Glass Red (`bg-red-500/5`, `border-red-500/30`, `text-red-400`) for dialog closures and camera termination. |
| **Outcome** | Unified visual design system across every page with soft hover glows, persistent active glass reflections, micro-haptic press animations, and consistent icon containers. |

---

## Issue 2: Application Routing Synchronization & Sidebar Submenu Architecture

| Attribute | Details |
| :--- | :--- |
| **Problem** | Admin pages and floor layout sections maintained duplicate local state hooks and synchronized sidebar actions via storage event listeners, causing state race conditions. Submenus in the sidebar did not toggle-collapse when clicked a second time. |
| **Solution** | Converted `AdminPage.tsx`, `TablesPage.tsx`, and `Sidebar.tsx` to be entirely route-driven via `activeTab` props from `App.tsx`. Refactored `toggleGroup` in `Sidebar.tsx` to toggle open/closed states (`!isOpen`) and navigate to child routes cleanly. |
| **Outcome** | Eliminated local storage event listeners and state duplication. Sidebar highlights and sub-navigation tabs update synchronously with URL path segments as the single source of truth. |

---

## Issue 3: Dynamic Mathematical Table Diagram & SVG Seating Renderer

| Attribute | Details |
| :--- | :--- |
| **Problem** | Table floor plan cards relied on manual row-based seat templates that could not scale to arbitrary seating capacities (10, 12, 16+) without hardcoding separate markup. |
| **Solution** | Built reusable SVG component [`TableDiagram.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/TableDiagram.tsx) calculating table dimensions ($W_{table} = \max(44, 24 + \text{maxLongEdge} \times 16)$) and chair coordinates mathematically. Dynamically highlights occupied seats from live token metrics while assigning semantic table status colors (Available → Green, Occupied → Orange, Reserved → Blue, Maintenance → Gray). |
| **Outcome** | Scalable, responsive seating SVG diagrams rendered consistently across main floor views, administrative controls, and inspect modals. |

---

## Issue 4: Descending Seating Capacity Grouping & Circular Glass Edge Navigation

| Attribute | Details |
| :--- | :--- |
| **Problem** | Floor plan table cards were displayed in flat grids without seating capacity organization, displaying visible browser scrollbars without smooth navigation controls. |
| **Solution** | Grouped table cards into descending capacity sections (8, 6, 4, 2 seats...) with natural alphanumeric table sorting (`T-01`, `T-02`). Built [`SeatingRow.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/SeatingRow.tsx) featuring hidden horizontal scrollbars (`.no-scrollbar`) and circular glass Left/Right edge arrow buttons that render conditionally based on scroll position (`scrollLeft > 5`, `scrollLeft + clientWidth < scrollWidth - 5`). |
| **Outcome** | Effortless horizontal row navigation with clean glass circular arrow controls and no visible scrollbars. |

---

## Issue 5: Attendance Kiosk UX Streamlining & Disabled Tooltip Feedback

| Attribute | Details |
| :--- | :--- |
| **Problem** | The Attendance biometric kiosk page contained three redundant "Enable Camera" buttons cluttering the interface. Disabled form buttons lacked hover feedback explaining required input conditions. |
| **Solution** | Streamlined `QuickAttendanceWebPage.tsx` by removing top/card camera buttons, leaving a single main trigger at the bottom. Configured global disabled state CSS rules and injected native `title` tooltip attributes on all disabled action buttons across the application. |
| **Outcome** | Cleaned up the attendance kiosk layout and ensured clear explanatory tooltips on all disabled form actions. |
