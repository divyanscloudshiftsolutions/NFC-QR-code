# Daily Technical & Architectural Issues Log — August 8, 2026

---

## Issue 1: CSS Specificity Collision on Destructive and Cancellation Button Surfaces

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Standardizing the default visual presentation of all cancellation, dialog close, deactivation, and camera shutoff triggers to match the red destructive interaction pattern across the receptionist, bartender, and administration views. |
| **Problems Identified** | In Light Theme, several destructive action buttons (such as Clear All in the notifications dropdown, Close Dialog in Table Setup, and Stop Camera Scanner in Bartender and kiosk pages) appeared purple or neutral by default. This occurred because `html:not(.dark) .premium-btn-secondary` in `index.css` had `!important` declarations (`background: #FFFFFF !important; border: 1px solid #DDD6FE !important; color: #7C3AED !important;`) that completely overrode local inline Tailwind red classes. Consequently, the red theme was only visible after hover/active interactions, violating visual hierarchy guidelines. |
| **Resolution** | Created a specific combination class selector `.premium-btn-secondary.cancellation-btn` in `index.css` for Light Theme. Added the `.cancellation-btn` class to the affected buttons in the markup. This override sets a soft red background (`rgba(239, 68, 68, 0.08) !important`), red border (`rgba(239, 68, 68, 0.3) !important`), and high-contrast red text (`#B91C1C !important`) by default, restoring visual parity before user interaction. |
| **Activities Completed** | Audited the markup across notifications, bartender scan, table plans, and biometric kiosk pages. Replaced static inline styles and class lists on 5 buttons to incorporate the specificity fix. Conducted visual checks of default, hover, active/pressed, and focus states. |
| **Files / Modules Updated** | [`web-frontend/src/styles/index.css`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/styles/index.css), [`web-frontend/src/components/layout/Header.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/layout/Header.tsx), [`web-frontend/src/pages/BartenderPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/BartenderPage.tsx), [`web-frontend/src/pages/QuickAttendanceWebPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/QuickAttendanceWebPage.tsx), and [`web-frontend/src/components/admin/TableManagement.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/TableManagement.tsx). |

---

## Issue 2: Hardcoded Color Mismatch and Visibility Bugs in Guest Session Release Buttons

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Aligning primary checkout, release table, and session deactivation submit buttons with a unified red destructive palette under Light Theme. |
| **Problems Identified** | Primary destructive actions, such as the `Confirm Deactivation` button in the customer session history view and the `Close & Release Table` button in the check-out dialog, were styled with `primary-btn bg-red-500`. Under Light Theme, the global `!important` purple color on `.primary-btn` turned these buttons purple. Furthermore, the default text color on the checkout modal button was hardcoded to `text-red-200` (light pink), which had virtually zero contrast against the light red background under Light Theme. |
| **Resolution** | Conditionally compiled the button class list depending on the `isDark` context. In Light Theme, removed the `primary-btn` class to bypass the purple style sheet override and replaced it with a soft red background (`bg-red-500/10`), thin border (`border-red-500/30`), and legible red text (`text-red-700`). Standardized the hover state to change to solid red (`hover:bg-red-600`) with white text (`hover:text-white`). Added focus rings (`focus:outline-none focus:ring-2 focus:ring-red-500/20`) for accessibility. |
| **Activities Completed** | Replaced the hardcoded class names on session checkout buttons in `DashboardPage.tsx` and `CustomerSessionsManager.tsx`. Verified that the buttons display in light red by default in Light Theme, transition to solid red on hover, and maintain their purple-gold style in Dark Theme (which remains locked). |
| **Files / Modules Updated** | [`web-frontend/src/pages/DashboardPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/DashboardPage.tsx) and [`web-frontend/src/components/admin/CustomerSessionsManager.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/admin/CustomerSessionsManager.tsx). |

---

## Issue 3: Color Intensity Typos and Low Contrast in System Alerts and Camera Overlays

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Correcting color name typos, contrast levels, and text overlay visibility in notifications, alerts, and viewfinder frames. |
| **Problems Identified** | 1) The live system alerts widget on the dashboard used invalid Tailwind color names (`bg-amber-550/15`, `bg-emerald-555/15`, `bg-red-555/15`) for alert icons backdrops, rendering them completely transparent. The text colors also had low contrast on light surfaces. 2) The absolute camera controls in the receptionist check-in scanner overlay (`CheckInPage.tsx`) used `text-text-main` (which resolves to black in Light Theme) on a dark translucent background (`bg-black/75`), rendering the text completely invisible. |
| **Resolution** | 1) Corrected the alert backdrop color names to standard Tailwind intensities (`bg-amber-500/15`, `bg-emerald-500/15`, `bg-red-500/15`) and increased text colors to the 700 series (`text-amber-700`, `text-emerald-700`, `text-red-700`) for high legibility. 2) Set absolute camera viewfinder switch and close buttons to use solid `text-white` to guarantee text contrast against the camera viewfinder stream. |
| **Activities Completed** | Scanned pages for invalid color names and text contrast issues. Corrected class list overrides in `DashboardPage.tsx` and `CheckInPage.tsx`. Verified text readability visually. |
| **Files / Modules Updated** | [`web-frontend/src/pages/DashboardPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/DashboardPage.tsx) and [`web-frontend/src/pages/CheckInPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/CheckInPage.tsx). |

---

## Issue 4: Dashboard Hour Chart Column Contrast and Legend Mismatch

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Standardizing chart column visibility, grid alignment, and legend keys in the dashboard analytics chart. |
| **Problems Identified** | 1) In Dark Theme, the regular shift revenue columns in the dashboard chart used `.analytics-bar-regular` (`var(--bg-secondary-surface)`), which was too dark and merged into the dark background, making it look like only peak data existed. 2) The regular shift legend key dot was hardcoded to `dark:bg-black/20`, rendering as a blank box that didn't match the column fill. 3) The Receptionist Dashboard chart lacked horizontal gridlines, reducing readability compared to the Admin portal chart. |
| **Resolution** | 1) Updated the Dark Theme background of `.analytics-bar-regular` in `index.css` to a semi-transparent brand purple (`rgba(141, 108, 229, 0.2)` and `rgba(141, 108, 229, 0.35)` on hover) to provide high contrast while remaining secondary. 2) Replaced the hardcoded legend indicator background with `.analytics-bar-regular` so that it automatically matches the column colors in both themes. 3) Added background grid lines (`border-border-main/15`) aligned with the Y-Axis tick labels (`₹60k` to `₹0`). |
| **Activities Completed** | Modified custom bar class selectors and inserted background grid structures in `DashboardPage.tsx`. Verified bar chart contrast and legend matching across both themes. |
| **Files / Modules Updated** | [`web-frontend/src/styles/index.css`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/styles/index.css) and [`web-frontend/src/pages/DashboardPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/DashboardPage.tsx). |

---

## Issue 5: Dynamic Seating SVG Table Diagram Label Contrast and Navigation Control Highlights

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Aligning dynamic seating SVG indicators, layout scroll buttons, and detail triggers to render high-contrast highlights under Light Theme. |
| **Problems Identified** | 1) In Light Theme, the text labels indicating seat states inside the SVG table layout diagram (`TableDiagram.tsx`) rendered with low contrast. 2) The horizontal seating row navigation scroll arrows on the Tables Page collapsed into flat outlines without a visible highlight, making it difficult for operators to navigate between rows. |
| **Resolution** | 1) Updated the SVG text identifier fill logic in `TableDiagram.tsx` to dynamically paint table labels in brand purple `#7C3AED` in Light Theme. 2) Restructured the hover shadow boundaries on the scroll arrows inside `SeatingRow.tsx` to paint premium purple border highlights under Light Theme, restoring visual feedback. |
| **Activities Completed** | Modified the SVG fill logic in `TableDiagram.tsx` and shadow/border styling configurations in `SeatingRow.tsx`. Inspected row navigation controls on the Seating Portal to confirm hover responsiveness. |
| **Files / Modules Updated** | [`web-frontend/src/components/TableDiagram.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/TableDiagram.tsx) and [`web-frontend/src/components/SeatingRow.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/components/SeatingRow.tsx). |

---

## Issue 6: Dialog & Modal Frosted Glass Backdrop Overlays and Viewfinder Backdrop Normalization

| Attribute | Details |
| :--- | :--- |
| **Project Overview** | Standardizing modal backdrops and camera viewfinder overlays to preserve page layout depth without causing excessive screen darkening in Light Theme. |
| **Problems Identified** | Across the Tables floor plan, bartender scan terminals, and FaceMark biometric attendance screens, all modal dialogs and webcam viewfinders utilized a hardcoded dark backdrop (`bg-black/80`, `bg-black/85`, or `bg-black/75`). In Light Theme, this caused the entire viewport to instantly turn pitch black when opening modal confirmation prompts or turning on the webcam, ruining the visual transitions. |
| **Resolution** | Replaced the hardcoded full-screen dark backdrops with theme-aware dynamic layers. Configured Light Theme to use a soft, slate-colored translucent overlay (`bg-slate-900/40` or `bg-slate-900/35`) and kept `bg-black/80` or `bg-black/75` for Dark Theme. This renders a beautiful, light frosted-glass backdrop that preserves spatial layers in Light Theme. |
| **Activities Completed** | Replaced hardcoded backdrop overlays in `TablesPage.tsx`, `BartenderPage.tsx`, and `QuickAttendanceWebPage.tsx` with dynamic classes. Verified modal backdrop transitions in both themes. |
| **Files / Modules Updated** | [`web-frontend/src/pages/TablesPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/TablesPage.tsx), [`web-frontend/src/pages/BartenderPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/BartenderPage.tsx), and [`web-frontend/src/pages/QuickAttendanceWebPage.tsx`](file:///d:/Cloud%20Shift%20Solutions%20Intern/NFC/NFC%20QR%20code/web-frontend/src/pages/QuickAttendanceWebPage.tsx). |
