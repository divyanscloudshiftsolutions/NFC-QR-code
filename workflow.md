# Hybrid NFC Card & Email QR System Workflow

## 1. Application Startup & Configuration Loading

Application starts.

↓

Backend connects to PostgreSQL.

↓

System loads delivery availability settings from:

system_configs

Values:

- nfc_card_enabled
- email_qr_enabled

↓

TokenService.getConfiguredDeliveryAvailability()

loads current settings.

↓

Configuration cached in Redis.

↓

Frontend starts.

↓

NfcBarContext calls:

GET /api/config

↓

Frontend receives available delivery methods.

Example:

NFC Card: Enabled

Email QR: Enabled

↓

Check-in screen dynamically shows available methods.

Important:

These settings decide what methods are available.

They do not decide the customer's method.

Customer method is selected during check-in.


---

# 2. Admin Delivery Availability Settings


Admin opens:

Admin Portal → Settings


↓

Admin controls availability:


NFC Card

ON / OFF


Email QR

ON / OFF


↓

Request:

PUT /api/config/delivery-methods


↓

Backend updates configuration.


Example:

Disable NFC Card.


Result:

New customers cannot choose NFC.


Existing customers:

continue with their existing method.


Example:

Customer A:

delivery_mode = NFC_CARD


Admin disables NFC.


Customer A:

Still works.


---

# 3. Customer Check-In


Receptionist opens Check-In.


↓

System loads available methods.


↓

Receptionist enters:


- Customer name
- Phone number
- Number of persons
- Email (required only for QR)


↓

Selects:

Place Type


↓

Assigns:

Available Table


↓

Receptionist selects:


💳 NFC Card


OR


📧 Email QR


↓

Backend creates token.


Token stores:


delivery_mode


Example:


Token 1001

delivery_mode = NFC_CARD


Token 1002

delivery_mode = EMAIL_QR


---

# 4. NFC Card Check-In


Receptionist selects:

NFC Card


↓

System checks:

NFC availability enabled.


↓

Receptionist scans blank NFC card.


↓

Card is linked with customer token.


↓

Card status:


AVAILABLE → ASSIGNED


↓

Table status:


AVAILABLE → OCCUPIED


↓

Customer receives card.


Session starts.


---

# 5. Email QR Check-In


Receptionist selects:

Email QR


↓

System checks:

Email QR availability enabled.


↓

Customer email validation.


↓

Token created.


↓

Secure QR payload generated.


↓

Email service sends QR ticket.


↓

Email delivery status stored.


↓

Customer receives QR code.


↓

Table status:


AVAILABLE → OCCUPIED


↓

Session starts.


---

# 6. Drink Redemption


Customer requests drink.


↓

Customer presents:


NFC Card

OR

QR Code


↓

Request:


POST /api/redemptions


↓

Backend checks:


token.delivery_mode


---

## NFC Customer


Customer taps card.


↓

System validates:


- Card assignment
- Token active
- Session not expired
- Table active
- Drink balance available


↓

Security check:

QR attempts rejected.


↓

Drink count reduced.


↓

Redemption history saved.


---

## Email QR Customer


Customer shows QR.


↓

Bartender scans QR.


↓

System validates:


- QR authenticity
- Token active
- Expiry time
- Drink balance
- Table status


↓

Security check:

NFC attempts rejected.


↓

Drink count reduced.


↓

Redemption history saved.


---

# 7. Time Extension


Customer requests more time.


↓

Receptionist approves.


↓

Existing token updated.


Updates:


- New expiry time
- Extension history


↓

Same token continues.


No new:

- NFC card
- QR code
- Email


---

# 8. Session Closure


System checks:


token.delivery_mode


---

## NFC Checkout


Customer returns card.


↓

Receptionist scans card.


↓

Session closed.


↓

Card reset.


Card status:


ASSIGNED → AVAILABLE


↓

Table:


OCCUPIED → AVAILABLE


---

## Email QR Checkout


Customer leaves.


↓

Receptionist:


Option 1:

Scan QR


OR


Option 2:

Search token/customer


↓

Session closed.


↓

QR becomes inactive.


↓

Table released.


---

# 9. Bartender Workflow


Bartender opens redemption screen.


If both enabled:


Shows:


- NFC scanner
- QR scanner
- Active sessions


↓

System accepts only correct method.


NFC token:

Only NFC works.


Email token:

Only QR works.


---

# 10. Offline Workflow


## NFC Mode


Internet unavailable.


↓

Receptionist can continue operations.


- Check-in
- Card assignment
- Redemption


↓

Operations stored locally.


↓

Internet returns.


↓

SyncService uploads pending operations.


↓

Duplicate operations prevented.


---

## Email QR Mode


New QR creation requires internet.


Because:


- QR generation
- Email sending


need online service.


Offline:


New QR check-in blocked.


Existing QR sessions continue if validation data is available.


---

# 11. Reporting


System records:


- Customer details
- Token
- Delivery mode
- Card assignment
- QR generation
- Email status
- Redemptions
- Extensions
- Checkout
- Table usage


Reports support:


NFC_CARD


EMAIL_QR


---

# 12. Error Protection


System blocks:


- Disabled delivery method
- Wrong scan method
- Invalid NFC
- Invalid QR
- Expired token
- Duplicate redemption
- No remaining drinks
- Email failure
- Table conflict


Database maintains:


✓ Correct token state

✓ Correct customer session

✓ Correct table status

✓ Correct redemption history