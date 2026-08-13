# Daily Issues Log — August 4, 2026

---

## Issue 1: Permanent Decommission of QR Smart Card Flow in Mobile Check-in Wizard

| Attribute | Details |
| :--- | :--- |
| **Problem** | The React Native application's check-in wizard prompted receptionists to select between physical QR Smart Cards and digital Email QR codes, and included complex card-writing and animation components. |
| **Solution** | Refactored `CheckInWizard.tsx` to remove the delivery channel selector, set the delivery mode statically to `'EMAIL_QR'`, and removed the entire QR pairing, writing code blocks, state variables, and animation configurations. |
| **Outcome** | Expo web production compiler verified successfully with zero errors. |

---

## Issue 2: Removal of QR Physical Scanner Workflows in Checkout and Bartender Views

| Attribute | Details |
| :--- | :--- |
| **Problem** | The bartender portal and check-out return modal prompted staff to scan and erase physical NDEF records from returned smart cards, which is incompatible with the single-delivery QR architecture. |
| **Solution** | Refactored `ReturnCardModal.tsx` to wipe card-return/erasing layouts, retaining only simple token selection verification prompts. Modified `BartenderPortal.tsx` to delete physical/simulate QR card scan handlers, remove the "START QR SCAN" trigger buttons, and clean unused `QRService` imports. |
| **Outcome** | React Native build checked successfully with zero errors. |

---

## Issue 3: Backend API Route and Card Inventory Decommissioning

| Attribute | Details |
| :--- | :--- |
| **Problem** | The backend API exposed endpoints under `/api/cards` for registering, listing, and modifying physical card inventories, and accepted card-related parameters in redemption, sync, and checkout endpoints. |
| **Solution** | Deleted all routes matching `/api/cards` and `/reports/cards`. Refactored `redeemHandler`, `checkoutSessionHandler`, and manual session close controllers to remove card-specific parameters (like `cardUid` or `eraseCard`), defaulting drink redemption presentation type to `'QR_SCAN'`. |
| **Outcome** | Backend build compiled successfully with zero errors. |

---

## Issue 4: Web Frontend Admin Settings and Inventory Cleanup

| Attribute | Details |
| :--- | :--- |
| **Problem** | The Vite web-frontend included tabs and settings pages to view physical smart cards and select dual delivery configurations, which are now obsolete. |
| **Solution** | Deleted the `SmartCardInventory.tsx` file and removed all routing cases and navigational links pointing to it in `AdminPage.tsx` and `AdminNavTabs.tsx`. Refactored `CheckInPage.tsx` to remove the selection tabs, drop Card UID inputs, and make `EMAIL_QR` static. |
| **Outcome** | Web frontend build compiled successfully with zero errors. |

---

## Issue 5: UI/UX Design Reference Collection

| Attribute | Details |
| :--- | :--- |
| **Problem** | A consistent, modern UI/UX reference was required before starting the visual refresh of the application. |
| **Solution** | Collected and organized high-quality UI/UX template references from **Dribbble** and stored them in **LinkMark** as the centralized design reference library for the upcoming UI/UX implementation. |
| **Outcome** | Design reference library prepared and ready for implementation. |

---

## Issue 6: UI/UX Template Organization in LinkMark

| Attribute | Details |
| :--- | :--- |
| **Problem** | UI/UX design references needed to be organized in a single location to streamline the upcoming implementation process. |
| **Solution** | Collected selected UI/UX templates from **Dribbble** and organized them in **LinkMark**, creating a centralized reference library for the UI/UX redesign and future implementation. |
| **Outcome** | UI/UX template repository prepared and organized for implementation. |

