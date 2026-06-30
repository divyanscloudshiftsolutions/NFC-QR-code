# Hybrid NFC Card & Email QR Bar Management System
# Complete Correct Workflow

## 1. Application Startup

Application starts.

↓

Backend server starts.

↓

Backend connects to PostgreSQL database.

↓

System loads global configuration:

Table:
system_configs

Contains:

- nfc_card_enabled
- email_qr_enabled

↓

TokenService loads delivery availability settings.

↓

Redis cache updated with latest configuration.

↓

Frontend application starts.

↓

NfcBarContext calls:

GET /api/config

↓

Frontend receives available delivery methods.

Example:

NFC Card = Enabled
Email QR = Enabled

↓

Check-in page displays available options.

Important:

Admin settings only control availability.

They do NOT change existing customer sessions.

Existing tokens continue with their original delivery_mode.



# 2. Admin Delivery Method Control

Admin Portal

↓

Admin opens:

Settings → Delivery Methods

↓

Admin changes:

NFC Card ON/OFF

Email QR ON/OFF

↓

API:

PUT /api/config/delivery-methods

↓

Backend updates system_configs.

↓

New check-ins follow the updated setting.


Example:

Admin disables NFC.

↓

New customer:

Cannot select NFC.


Existing customer:

delivery_mode = NFC_CARD

Still works normally.



# 3. Reception Check-In Start

Receptionist opens:

New Check-in


↓

Enter customer details:

- Name
- Phone Number
- Number of Persons
- Email (only required for Email QR)


↓

Select place type.

↓

System checks:

Available tables.


↓

Receptionist selects delivery method:

Option 1:
NFC Card

Option 2:
Email QR



# 4. NFC Card Check-In Workflow

Receptionist selects:

NFC_CARD


↓

Backend verifies:

nfc_card_enabled = true


↓

Create customer session.

Database:

token.deliveryMode = NFC_CARD

paymentVerified = true


↓

Generate token/session.


↓

Receptionist scans blank NFC card.


↓

Card UID linked:

card.status:

AVAILABLE
      ↓
ASSIGNED


↓

Token updated:

cardUid = scanned card UID


↓

Selected table:

AVAILABLE
      ↓
OCCUPIED


↓

Session becomes active.


↓

Customer receives NFC card.


↓

Customer can redeem drinks.



# 5. Email QR Check-In Workflow


Receptionist selects:

EMAIL_QR


↓

Backend verifies:

email_qr_enabled = true


↓

Email validation:

Required.


↓

Backend creates pending session.


Database:

deliveryMode = EMAIL_QR

status = ACTIVE

paymentVerified = false

table = PENDING placeholder


↓

Generate secure QR token.


↓

Email service sends QR.


Email contains:

- Customer greeting
- QR Code
- Token details


↓

Customer receives QR.


↓

Receptionist scans customer QR.


↓

Backend verifies:

- Token exists
- QR signature valid
- deliveryMode = EMAIL_QR
- Token not expired
- paymentVerified = false


↓

QR accepted.


↓

Receptionist assigns real table.


↓

Manual billing/payment completed.


↓

Activation API:

POST /api/check-in/activate


Updates:

paymentVerified = true

table = selected table

table status:

AVAILABLE
      ↓
OCCUPIED


↓

Email QR session becomes active.


↓

Customer can redeem drinks.



# 6. Drink Redemption Workflow


Customer requests drink.


↓

Customer presents:

NFC Card

OR

Email QR


↓

Bartender scans.


↓

POST:

/api/redemptions


↓

Backend checks:

- Token exists
- Delivery method matches
- Token active
- Session not expired
- paymentVerified = true
- Remaining drinks available



## NFC Redemption


Input:

Card UID


↓

Backend finds:

cardUid


↓

Checks:

deliveryMode = NFC_CARD


↓

Approve.


↓

Drink count decreases.


↓

Redemption saved.



## Email QR Redemption


Input:

QR token


↓

Backend validates:

QR signature


↓

Checks:

deliveryMode = EMAIL_QR


↓

Checks:

paymentVerified = true


↓

Approve.


↓

Drink count decreases.


↓

Redemption history saved.



Wrong method:

Rejected.



# 7. Extend Time Workflow


Customer requests extension.


↓

Receptionist approves.


↓

Existing token updated.


Updates:

- endTime
- extension duration
- extension history


↓

Same session continues.


No new:

- NFC card
- QR code
- token



# 8. Session Checkout Workflow


System checks:

deliveryMode



## NFC Checkout


Customer returns card.


↓

Receptionist scans card.


↓

Backend finds token.


↓

Close session.


Updates:

token status = closed


Card:

ASSIGNED
   ↓
AVAILABLE


Table:

OCCUPIED
   ↓
AVAILABLE



## Email QR Checkout


Customer leaves.


↓

Receptionist:

Scan QR

OR

Search customer/token


↓

Backend validates:

token active


↓

Close session.


↓

QR becomes invalid.


↓

Table released.



# 9. Bartender Portal Workflow


Bartender opens portal.


↓

Loads active sessions.


Only shows:

paymentVerified = true


↓

Available methods:

NFC scanner

QR scanner


↓

System accepts only matching method.


NFC token:

Only NFC works.


EMAIL_QR token:

Only QR works.



# 10. Data Persistence Workflow


Online Mode:


Every operation:

Frontend

↓

Backend API

↓

PostgreSQL


Database is source of truth.


App refresh:

Frontend reloads.

↓

Fetch:

GET /tokens/active

↓

Restore sessions from database.



No important data depends on local storage.



# 11. Offline Mode


Offline activates ONLY when:

- No internet connection
OR
- API fails because of connectivity loss


Offline queue stores:

- check-in
- redemption
- updates


Stored locally temporarily.


Internet returns.


↓

SyncService runs.


↓

Uploads queued operations.


↓

Backend saves to PostgreSQL.


↓

Local queue cleared.



# 12. Reporting Workflow


Reports use database records.


Tracks:

- Customers
- Tokens
- Delivery mode
- NFC assignments
- QR delivery
- Redemptions
- Extensions
- Checkout
- Revenue
- Table usage


Pending EMAIL_QR:

paymentVerified = false

Excluded from:

- active guests
- redemption reports
- sales reports
- occupancy statistics


Activated sessions only included.



# 13. Security & Validation


System blocks:


Disabled method

↓

Rejected


Wrong scan type

↓

Rejected


Invalid QR

↓

Rejected


Expired token

↓

Rejected


Duplicate redemption

↓

Rejected


No drinks remaining

↓

Rejected


Unpaid EMAIL_QR

↓

Cannot redeem


Database always maintains:


✓ Correct token state

✓ Correct delivery mode

✓ Correct customer session

✓ Correct table occupancy

✓ Correct redemption history

✓ Correct payment status