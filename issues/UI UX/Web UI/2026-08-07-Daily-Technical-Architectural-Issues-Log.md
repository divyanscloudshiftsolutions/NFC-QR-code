# Daily Technical & Architectural Issues Log — August 7, 2026

---

## Issue 1: Receptionist Dashboard Grid Alignment & Space Utilization Standardization

| Attribute | Details |
| :--- | :--- |
| **Problem** | Metric panels, activities timeline, alerts stream, and quick action widgets on the receptionist dashboard page had unequal heights, inconsistent gaps, and left major blank areas on desktop screens. The "Live Customer Sessions" panel was constrained to a half-width grid, limiting column space and forcing side-by-side misalignment. |
| **Solution** | Reorganized the dashboard using a standardized grid layout. Placed "Quick Operator Actions" and "Live Customer Sessions" as full-width components spanning the entire viewport. Moved "KPI Analytics Summary" below the active sessions table as a full-width metrics row (`grid-cols-2 md:grid-cols-4`). Aligned the bottom cards (Revenue Chart, Alerts, and Activities) into a 4-column row (`grid-cols-1 lg:grid-cols-4`) with a unified height of `h-[340px]`, adding scrollbars for list items. Removed the redundant "Mode" column from the customer sessions table. |
| **Outcome** | A balanced, compact, and visually justified dashboard layout without any forced stretching, aligning strictly with the Premium Glass spacing guidelines. |

---

## Issue 2: Seating Peaks Chart Visual Styling & Gradient Unification

| Attribute | Details |
| :--- | :--- |
| **Problem** | The "Hourly Revenue Analytics & Seating Peaks" chart on the Receptionist Dashboard used basic, solid coloring that did not match the premium purple-gold gradient styling of the Administration Revenue Analytics chart. |
| **Solution** | Refactored the dashboard chart configuration to utilize the same Recharts gradient color palette from the Admin module. Configured peak hours (e.g. 10 PM) to render with the `from-[#8D6CE5] to-[#F5E08B]` gold-purple gradient and glow shadow filter, while regular shift hours use `.analytics-bar-regular` CSS classes. Added a matching chart legend footer explaining peak vs regular shift hours. |
| **Outcome** | Achieved complete visual design consistency across all data visualization charts in the application. |

---

## Issue 3: Checkout Modal Dialog Contrast & Brand Color Policy Correction

| Attribute | Details |
| :--- | :--- |
| **Problem** | The "Checkout / Close Session" modal dialog had poor text contrast and button styling. The header text and secondary actions violated the brand color policy by using ad-hoc text highlights or non-standard border states. |
| **Solution** | Set the checkout modal header text to standard white (`text-text-main`) with a red warning icon (`text-red-500`). Configured select input focus states to use the standard brand purple border (`focus:border-[#8D6CE5]`). Aligned the Cancel button to use secondary design patterns (`premium-btn-secondary`) and styled the Close confirmation button with high-contrast glass danger aesthetics (`bg-red-500/20 hover:bg-red-600 text-red-200 border-red-500/30`). |
| **Outcome** | Resolved accessibility and text visibility bugs in the session closing flow while complying with the repository-wide brand color policy. |

---

## Issue 4: Bartender Service Station Workflow Redesign (QR-Only Architecture)

| Attribute | Details |
| :--- | :--- |
| **Problem** | The Bartender Service Station layout featured a cluttered dual-panel workspace that mixed NFC card scans, manual forms, and order queues, which did not align with the clean QR-only flow. |
| **Solution** | Redesigned the workstation to use two dedicated tabs: **QR Scan** and **Check-ins**. Removed the obsolete "Orders Queue" tab. Centered a single-column layout container (`max-w-xl mx-auto`) for the QR Scan tab that dynamically morphs from the **Pass Verification Terminal** (live camera viewfinder + manual input) into the **Verified Guest Pass Summary** (drink progress bar, quota details, and redemption controls) with a quick "Scan Next" reset option. Displays active checked-in sessions in the Check-ins tab as full-width horizontal glass cards with search (Guest Name, Phone, Email) and quick actions (Redeem, Extend, Checkout, Scan Mode). |
| **Outcome** | Streamlined the bartender's daily workflow into a focused, highly interactive, and information-dense workspace. |

---

## Issue 5: Token Code Typography & Highlight Standardization

| Attribute | Details |
| :--- | :--- |
| **Problem** | Token codes (e.g. `TKB-0104`) were highlighted in purple (`text-[#8D6CE5]`) across multiple dashboard views, table plans, success screens, and verification terminals, breaching the brand color guidelines that restrict non-white accent text for general alphanumeric codes. |
| **Solution** | Swapped all instances of the purple highlight class (`text-[#8D6CE5]`) with standard white text (`text-text-main`) for token identifiers (`tk.tokenNumber`) across the Dashboard table, deactivation/extension modals, Live Card view, Table details modal, Bartender verification view, and Check-In success screens. |
| **Outcome** | Standardized typography colors for identifiers repository-wide to match design rules. |

---

## Issue 6: Application-Wide Camera Lifecycle & Resource Management Standardization

| Attribute | Details |
| :--- | :--- |
| **Problem** | Webcam streams and camera hardware resources remained active in the background when users switched tabs internally, navigated away from scanning stages, or when the browser tab lost focus/minimized. The root cause was a race condition in the asynchronous `navigator.mediaDevices.getUserMedia` promise. If a tab switch or route change occurred while the browser was requesting camera access, the promise resolved *after* unmount or state switch, initializing the camera in the background with no way to turn it off, keeping the camera LED permanently on. Additionally, configuring the unmount `useEffect` with the `[stream]` dependency caused it to execute its cleanup block (terminating camera tracks) immediately upon camera initialization, turning the camera off automatically after ~1 second. Furthermore, rapid back-and-forth tab switches spawned concurrent pending requests that overlapped, and subtabs did not automatically initialize/suspend cameras. |
| **Solution** | Standardized camera controls across `CheckInPage.tsx`, `BartenderPage.tsx`, and `QuickAttendanceWebPage.tsx` using synchronous refs (`activeStreamRef` and `cameraRequestIdRef` versioning). In `startCamera()`, `cameraRequestIdRef.current` is incremented. When `stopCamera()` or an unmount cleanup runs, it increments the ref. When the asynchronous `getUserMedia` promise resolves, it checks if the current request version matches the latest Ref value; if it has changed, it immediately stops the resolved tracks and aborts, preventing concurrent leaks. Refactored `CheckInPage.tsx` stage observer to automatically start the camera on stage 3 and release it immediately on any other subtab (stage 1, 2, 4, 5). Upgraded all `stopCamera()` logic to explicitly disable tracks (`track.enabled = false`), call `track.stop()`, pause the video player, and set `srcObject` to null to guarantee browser hardware release. |
| **Outcome** | Achieved complete lifecycle security and resource efficiency for camera hardware application-wide, preventing leaked background cameras, ensuring video previews initialize and stay active correctly, and turning device camera LEDs off immediately upon navigation. |
