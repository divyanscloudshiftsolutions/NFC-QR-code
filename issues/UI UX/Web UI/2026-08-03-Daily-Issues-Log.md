# Daily Issues Log — August 3, 2026

---

## Issue 1: Guest Headcount Input Selector & Styling

| Attribute | Details |
| :--- | :--- |
| **Problem** | The guest headcount input field container in the receptionist check-in wizard was misaligned and lacked theme-conforming styles. |
| **Solution** | Restructured the input selector styles, adjusted container margins, and aligned text layers with high-contrast themes. |
| **Outcome** | Confirmed that the headcount input conforms to UI/UX specifications and centers properly across all screen resolutions. |

---

## Issue 2: Responsive Quantitative Stepper Controls

| Attribute | Details |
| :--- | :--- |
| **Problem** | Receptionists were forced to manually type headcounts because the guest selector lacked physical increment and decrement button controls. |
| **Solution** | Created responsive plus and minus control steppers synced with state boundaries, capping selectors dynamically between `1` and maximum table capacity. |
| **Outcome** | Verified that tapping controls dynamically alters headcount and scales layout boundaries responsively on mobile and web viewports. |

---

## Issue 3: Staff Directory & Smart Card Data Fetching

| Attribute | Details |
| :--- | :--- |
| **Problem** | The Staff Management and Smart Card Inventory tabs in the web admin portal displayed empty lists due to missing API data-fetching bindings. |
| **Solution** | Programmed active API client methods (`api.getUsers` and `api.getCards`) and mapped returned lists directly to the dashboard layout state. |
| **Outcome** | Confirmed that user roles, logins, smart card UIDs, and assigned statuses load dynamically from backend server configurations. |

---

## Issue 4: Database Storage for Staff & Smart Cards

| Attribute | Details |
| :--- | :--- |
| **Problem** | Web admin panels relied on static mock arrays which prevented changes from persisting or reflecting actual server-side databases. |
| **Solution** | Mapped card inventory and user account lists to PostgreSQL using Prisma seeding scripts and aligned API request schemas to pull direct DB entries. |
| **Outcome** | Verified that all smart cards and employee profiles are stored in and retrieved from the central database server. |

---

## Issue 5: Admin Panel Mount-Time Lifecycle

| Attribute | Details |
| :--- | :--- |
| **Problem** | Admin dashboard tables failed to render database data upon initial tab load due to an incorrect hook execution sequence. |
| **Solution** | Refactored side-effect hooks to trigger requests immediately when components mount, ensuring fresh data is retrieved. |
| **Outcome** | Verified that switching tabs immediately displays the updated staff, table, and smart card records without rendering lag. |

---

## Issue 6: Web vs Native Bartender Gaps Audit

| Attribute | Details |
| :--- | :--- |
| **Problem** | Discrepancies in features between the web portal and React Native app left mobile operators unable to verify customer details. |
| **Solution** | Audited data structures for lookup, scanning, and checkout and created documentation mapping shared customer schema attributes. |
| **Outcome** | Generated a checklist that aligned screen components and verification states between the desktop receptionist views and mobile views. |

---

## Issue 7: Mobile Bartender Camera QR Scanner

| Attribute | Details |
| :--- | :--- |
| **Problem** | React Native's bartender interface was limited to manual lookup and lacked a camera scanner, preventing QR ticket scans at the bar. |
| **Solution** | Integrated camera capture bindings via `expo-camera` and designed a live viewfinder scanner overlay with a target scanning guide. |
| **Outcome** | Confirmed that tapping the camera trigger scans guest QR codes and loads profile states immediately. |

---

## Issue 8: Native Bartender Live Verification Flow

| Attribute | Details |
| :--- | :--- |
| **Problem** | The mobile bartender screen had no profile summary panel to view names, tables, and remaining drink balances after scanning. |
| **Solution** | Designed layout modules displaying verification summaries (Guest name, assigned table number, remaining beverage balances) along with serve/undo actions. |
| **Outcome** | Confirmed scanned customer details load instantly and beverage updates sync successfully to the backend database. |

---

## Issue 9: Dynamic Receipt Rate Calculations

| Attribute | Details |
| :--- | :--- |
| **Problem** | Estimated costs in the live check-in receipt fell back to hardcoded values because the selector checked for literal string IDs instead of database UUIDs. |
| **Solution** | Reconfigured check-in page rates queries to match standard/premium rates by name case-insensitively, referencing active database pricing configs. |
| **Outcome** | Verified that updating prices in the System Admin portal immediately reflects in check-in receipts without hardcoding. |

---

## Issue 10: Comparison Pricing Breakdown Details

| Attribute | Details |
| :--- | :--- |
| **Problem** | Comparison option cards did not show the rate per head or calculation formula, making pricing logic obscure. |
| **Solution** | Added explicit `"Rate per Head"` labels and dynamic `"Calculation:"` rows showing the breakdown `(Rate × Guests)` to the side panel. |
| **Outcome** | Verified that changing headcount recalculates estimates and displays the exact calculation breakdown using clear, user-level terms. |

---

## Issue 11: Local QR Code Email Notification Failure

| Attribute | Details |
| :--- | :--- |
| **Problem** | QR code entry passes were not being dispatched to customer emails during local runs because `SEND_REAL_EMAILS` defaulted to false if omitted in `.env`. |
| **Solution** | Updated `EmailNotificationService.ts` to default `sendRealEmails` to true unless explicitly configured as false or running in test environments, and added `SEND_REAL_EMAILS=true` in `backend/.env`. |
| **Outcome** | Confirmed that creating a check-in successfully triggers real email dispatches containing the token QR code to the customer's mailbox. |

---


