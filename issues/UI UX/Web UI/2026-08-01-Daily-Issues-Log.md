# Daily Issues Log — August 1, 2026

---

## Issue 1: Check-In Wizard & Navigation System Gaps

| Attribute | Details |
| :--- | :--- |
| **Problem** | The receptionist check-in wizard lacks a dedicated pre-registered guest QR scan stage, custom headcount incrementers, progress header line indicators, and dynamic billing receipts, while refreshing the browser redirects users back to the dashboard. |
| **Solution** | Converted check-in wizard to 5 stages with camera viewfinder/manual QR validation, custom synchronized numeric headcount controls, active progress indicator paths, itemized billing tables, and localStorage state persistence for all navigation components. |
| **Outcome** | Verified that guest details populate upon QR scan, headcount boundaries restrict invalid inputs, billing receipts update in real-time, and browser refreshes preserve active pages, tabs, and table selection filters across Vite production builds. |

---

## Issue 2: FaceMark Kiosk Page Viewport Overflow

| Attribute | Details |
| :--- | :--- |
| **Problem** | The FaceMark Quick Attendance kiosk page exceeds standard browser viewport heights, requiring vertical scrolling to access bottom camera triggers and text input fields. |
| **Solution** | Optimized layout container max-width to `max-w-2xl`, decreased element paddings and margins, and reduced card sizes to prevent vertical layout overflow. |
| **Outcome** | Verified that the entire biometric attendance panel fits within a single screen view on initial tab load without requiring vertical scrolling, passing production Vite bundle compilation checks. |

---

## Issue 3: Seating & Tables Seating Map & Status Visual Gaps

| Attribute | Details |
| :--- | :--- |
| **Problem** | Seating and tables cards lacked a clean visual seating layout diagram, and the green/gray colors did not distinguish between available and occupied tables effectively. |
| **Solution** | Replaced the flat seat dots with micro floor-plan seating diagrams on cards, configured available tables to use green status badges, occupied tables to use orange badges, and applied a faded layout style to occupied tables. |
| **Outcome** | Verified that available tables highlight in green and occupied tables fade into an orange theme, showing an intuitive micro seat plan diagram that passes compilation and production Vite builds. |

---

## Issue 4: System Administration Portal Gaps & Bug Fixes

| Attribute | Details |
| :--- | :--- |
| **Problem** | Staff account creation was failing due to mismatched payload keys (`pin` vs `password`), employee code registrations lacked real-time duplicate checks or format advice tags, table setup cards lacked seating map visualizations, and global default delivery modes fell back to QR card instead of Email QR. |
| **Solution** | Mapped `pin` to `password` in `api.createUser`, integrated users cache lookup to prevent duplicates, added real-time inline advice helpers, modernized table setup card grids with seating layouts and inspection modals, and corrected delivery mode default fallbacks to Email QR. |
| **Outcome** | Verified that staff creation succeeds end-to-end, duplicate registrations are blocked with warning text, and table cards correctly display active seating layouts and inspection modals across production Vite builds. |

---

## Issue 5: Light Theme Support & Notification Bell Integration

| Attribute | Details |
| :--- | :--- |
| **Problem** | The web frontend lacked functional light theme support, causing key elements (such as seating indicators, analytics bar charts, inactive camera views, and staff badges) to be unreadable or retain dark-themed styling. Hover/tooltip actions also blended into light backgrounds. The notification bell was a static placeholder. Typography was not standardized globally, as container nodes using Tailwind's `font-sans` class bypassed the global body declaration. |
| **Solution** | Set up dynamic CSS variables in `index.css`, created `.analytics-bar-regular` for high-contrast bar chart columns, configured active/inactive camera backdrops, updated cards/badges, resolved double background classes, made unselected navigation tabs hover states contrasty, styled chart tooltips with dark theme cards in light mode, built the notifications popover panel, imported **Poppins** from Google Fonts, set it as the global application font, and explicitly mapped `--font-sans: 'Poppins', sans-serif` in Tailwind v4 `@theme` block. |
| **Outcome** | Verified that all components, charts, gridlines, legends, and hover tooltips render with high contrast. Confirmed navigation tabs, action buttons, and modal dismiss buttons show proper background shifts on hover. Visually verified that 100% of all UI texts, labels, and menus render in Poppins family across all views. Checked all Vite production builds and TypeScript validation checks pass with zero errors. |

---

## Issue 6: Customer Check-in Page – Dynamic Seating Capacity & UI Refinement

| Attribute | Details |
| :--- | :--- |
| **Problem** | The customer check-in page used hardcoded limits for the guest headcount input. The headcount input field forced values to 1 when backspaced, preventing direct typing of double-digit numbers. Seating category (Standard vs Premium) availability did not dynamically respect the largest configured table sizes per zone, and the live check-in receipt lacked rate comparisons before table assignment. |
| **Solution** | Allowed headcount state `personsCount` to support empty string (`number | ''`) as a temporary editing state. Mapped `maxCapacity` dynamically to the highest table capacity in the database. Configured Standard vs Premium zone max capacities dynamically (`standardMaxCapacity`, `premiumMaxCapacity`). Redesigned the Live Check-in Receipt to show side-by-side rate summaries (including availability status and pricing details) for both zones before table selection, switching to the selected area only after a table is assigned. |
| **Outcome** | Confirmed that the guest headcount field allows complete clearing and direct numerical entry. Verified both Standard and Premium options remain visible simultaneously before table selection, and the receipt switches dynamically after table assignment. Confirmed all Vite production builds and TypeScript typechecks compile successfully with zero errors. |

---

