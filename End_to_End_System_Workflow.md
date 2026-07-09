Module 1 — Authentication (Login & Role Selection)
Functional Details

Module Name: Authentication (Login & Role Selection)

Page Name: Login Screen

Purpose:
The Login screen acts as the secure entry point of the application. It authenticates users based on their credentials and grants access according to their assigned role. The module ensures that only authorized personnel can access the system and prevents unauthorized usage.

Who Can Access:

Admin
Manager
Staff (Receptionist/Bartender)

How to Reach:

Automatically displayed when the application starts.
Displayed again after logout.
Displayed if the previous session has expired.
User Workflow
Step 1 – Launch Application

When the application is opened, the Login page is displayed.

The system checks whether a valid authentication session already exists.

If a valid session exists, the user is automatically redirected to the appropriate dashboard.
Otherwise, the Login page remains visible.
Step 2 – Enter Credentials

The user enters:

Username
Password

Then selects one of the available roles.

Available roles:

Admin
Manager
Staff
Step 3 – Validation

Before sending the login request, the application validates:

Username should not be empty.
Password should not be empty.
A role must be selected.

If any validation fails, the application displays an appropriate validation message and does not continue.

Step 4 – Authentication

The application sends the login request to the backend.

Authentication validates:

Username
Password
Selected Role
Active Account Status
Step 5 – Successful Login

If authentication succeeds:

JWT Access Token is generated.
User information is stored securely.
User role is identified.
Appropriate dashboard is opened.

Navigation:

Admin

↓

Admin Dashboard

Manager

↓

Tables Portal (Read Only)

Staff

↓

Tables Portal / Bartender Workspace

Step 6 – Failed Login

If authentication fails:

Possible reasons:

Invalid username
Invalid password
Wrong role selected
Disabled account
Server unavailable

The application displays a clear error message without exposing internal security details.

Input Fields
Username

Purpose:
Unique staff identification.

Validation:

Required
Cannot be empty
Password

Purpose:

Secure authentication password.

Validation:

Required
Hidden while typing
Role Selector

Purpose:

Determines which workspace the user wants to enter.

Options:

Admin
Manager
Staff

Validation:

Selected role must match the role stored in the database.

Buttons
Login

Action:

Authenticates user credentials.

Backend API
POST /auth/login
Database Operations

The backend:

Verifies username
Verifies password
Verifies role
Generates JWT token
Returns authenticated user details
Success Flow

Application Launch

↓

Enter Username

↓

Enter Password

↓

Select Role

↓

Click Login

↓

Authentication Successful

↓

Generate Token

↓

Store Session

↓

Navigate to Dashboard

Failure Flow

Application Launch

↓

Enter Credentials

↓

Click Login

↓

Authentication Failed

↓

Display Error Message

↓

Remain on Login Page

Security Features
Password masking
JWT authentication
Role-based authorization
Session validation
Unauthorized access prevention
Protected application routes
Edge Cases
Empty username
Empty password
Invalid credentials
Wrong role selected
Disabled user account
Expired authentication token
Server unavailable
Network failure


Module 2 — Customer Check-in Workflow (Receptionist Workspace)
Functional Details

Module Name: Customer Check-in Workflow

Page Name: Check-in Wizard

Purpose:
The Customer Check-in module is responsible for registering a new customer, collecting customer details, validating information, assigning an available table, processing payment, and activating the customer session through either an NFC Card or an Email QR Code.

Who Can Access:

Admin
Reception Staff

How to Reach:

Admin/Staff Dashboard

↓

Click Check-in

↓

Customer Check-in Wizard opens

Workflow Overview

There are two supported customer check-in methods:

Method 1

NFC Card Check-in

Method 2

Email QR Code Check-in

Both workflows share the same customer registration process but differ during session activation.

Step 1 — Customer Information

Reception staff enters customer information.

Required fields include:

Customer Name
Mobile Number
Number of Guests (Pax)
Seating Area
Delivery Method

Optional:

Email (Required only for QR workflow)
Field Validation
Customer Name

Validation

Required
Cannot be blank
Mobile Number

Validation

Exactly 10 digits
Starts between 6–9
Duplicate active customer not allowed
Number of Guests

Validation

Minimum 1
Cannot exceed table capacity
Seating Area

Example

Standing Bar
Premium Lounge
VIP Area

Validation

Required.

Delivery Method

Available options

NFC Card
Email QR Code
Method A — NFC Card Workflow
Step 2

Choose

NFC Card

↓

Click Continue

Step 3

Table Assignment Screen opens.

System automatically displays:

Available Tables
Capacity
Seating Area
Table Status

Available tables appear in Green.

Unavailable tables remain disabled.

Step 4

Receptionist selects a suitable table.

System verifies:

Table Available
Capacity Match
Area Match

If validation succeeds

↓

Continue

Step 5

Billing Summary

Displays

Session Duration
Base Price
Drink Allowance
Additional Charges

Receptionist collects payment manually.

Step 6

Program NFC Card

Staff places a blank NFC Card near the device.

Click

Write Card

Application writes:

Session Token
Customer Session ID
Security Information

After successful write

↓

Session becomes ACTIVE

↓

Table becomes OCCUPIED

↓

Card becomes ASSIGNED

NFC Success Flow

Customer Details

↓

Assign Table

↓

Payment

↓

Write NFC Card

↓

Activate Session

↓

Customer Seated

NFC Failure Cases

Possible failures

NFC Disabled
Card Removed Early
Invalid Card
Write Failed
Network Failure
Duplicate Active Session

System displays appropriate error and prevents activation.

Method B — Email QR Workflow
Step 2

Choose

Email QR Code

↓

Continue

Step 3

Customer Email becomes mandatory.

Validation

Proper Email Format
Email Required
Duplicate Active Email Not Allowed
Step 4

Application generates

Signed QR Token

↓

Email automatically sent

↓

Session Status

PENDING

Step 5

Customer arrives.

Receptionist clicks

Scan QR

Camera opens.

Scan customer QR.

Alternative

Manual Token Entry

Step 6

QR Verification

System verifies

Token Valid
Not Expired
Not Used
Customer Exists
Step 7

Table Assignment

Receptionist selects an available table.

Step 8

Payment Collection

Collect payment.

Click

Payment Collected

↓

Session becomes ACTIVE

↓

Table becomes OCCUPIED

QR Success Flow

Customer Registration

↓

Generate QR

↓

Email Customer

↓

Customer Arrives

↓

Scan QR

↓

Assign Table

↓

Payment

↓

Activate Session

QR Failure Cases

Possible failures

Invalid QR
Expired QR
Already Used QR
Customer Not Found
Table Occupied
Network Failure
Backend APIs

Customer Registration

POST /tokens/create

QR Verification

GET /check-in/verify-qr/:token

Activate Session

POST /check-in/activate
Database Operations

System creates

Customer Session

↓

Creates Session Token

↓

Assigns Table

↓

Updates Table Status

↓

Creates Active Session

↓

Stores Payment Status

↓

Logs Check-in Time

Business Rules
One active session per customer.
One active session per table.
Table capacity cannot be exceeded.
Duplicate active sessions are blocked.
Payment required before activation.
QR Token can be used only once.
NFC Card cannot be assigned twice.
Occupied tables cannot be reassigned.
Edge Cases
Customer enters wrong phone number.
Duplicate customer attempts check-in.
Internet disconnects during activation.
NFC write interrupted.
QR expired.
Table occupied while assigning.
Invalid email.
Payment cancelled.
Customer leaves before activation.
Tanglish Workflow

Reception staff Check-in page-ku varuvanga.

First customer details fill pannuvanga.

Customer Name, Mobile Number, Pax count enter pannuvanga.

Next Seating Area select pannuvanga.

Adhukkapparam rendu option irukkum.

Option 1 — NFC Card

Reception staff NFC Card select pannuvanga.

Continue pannumbodhu Available Tables open aagum.

Green table select pannuvanga.

Bill collect pannuvanga.

Blank NFC Card phone backside-la touch pannuvanga.

Write Card button click pannuvanga.

Write successful aanadhum customer session ACTIVE aagum.

Table Occupied state-ku maarum.

Customer direct table-ku poyiduvaar.

Option 2 — Email QR

Customer email enter pannuvanga.

Email QR option select pannuvanga.

System automatic QR generate pannum.

Customer email-ku QR send pannum.

Customer bar-ku vandha apram QR scan pannuvanga.

QR verify aana apram table assign pannuvanga.

Payment collect pannuvanga.

Payment Collected button press pannumbodhu session ACTIVE aagum.

Table occupied aagum.

Customer seating start pannalaam.




Module 3 — Tables Portal & Table Management
Functional Details

Module Name: Tables Portal & Table Management

Page Name: Tables Portal

Purpose:
The Tables Portal is the central workspace of the application. It provides a real-time visual representation of every table inside the bar, allowing staff and administrators to monitor occupancy, assign customers, extend sessions, perform checkouts, and manage table status efficiently.

Who Can Access

Admin
Staff
Manager (Read Only)
How to Reach

Login

↓

Dashboard

↓

Click Tables

↓

Tables Portal opens

Main Purpose

The Tables Portal allows users to:

View all tables
Monitor live occupancy
Check session timers
View customer details
Assign customers
Extend sessions
Checkout customers
Monitor table health
Track availability

Everything happens from a single screen.

Table Status Types

Every table has its own status.

Available

Color: Green

Meaning:

Ready for new customer
No active session
Can assign immediately

Available Actions

Assign Table
View Details
Occupied

Color: Gold / Orange

Meaning:

Customer currently seated
Active session running

Displays

Customer Name
Pax Count
Remaining Time
Drinks Balance

Available Actions

View Details
Extend Session
Checkout
Expiring Soon

Color: Red

Meaning

Customer session has less than 15 minutes remaining.

Displays

Countdown Timer
Warning Badge

Available Actions

Extend Session
Checkout
Reserved

Color: Blue

Meaning

Reserved for upcoming booking.

Cannot assign another customer.

Maintenance

Color: Gray

Meaning

Table temporarily unavailable.

Examples

Cleaning
Broken furniture
Maintenance work

Cannot perform

Check-in
Assignment
Information Displayed on Every Table Card

Each table card displays

Table Number
Area
Capacity
Status
Customer Name (if occupied)
Session Timer
Drinks Remaining
Pax Count

Everything updates automatically in real time.

Opening Table Details

User clicks a table.

↓

Bottom Sheet opens.

This is the main management screen for that table.

Table Details Bottom Sheet

Displays complete information.

Section 1

Basic Information

Shows

Table Number
Area
Capacity
Status
Section 2

Customer Information

If occupied

Displays

Customer Name
Mobile Number
Group Size
Check-in Time
Section 3

Session Information

Displays

Session Start Time
Remaining Time
Total Duration
Drinks Remaining

Timer updates continuously.

Section 4

Visual Seating Layout

Shows

Mini seating arrangement.

Occupied chairs

↓

Highlighted

Empty chairs

↓

Gray

Manager can understand occupancy instantly.

Available Buttons

Depending on table status.

Assign Table

Visible only when

Table Available

Workflow

Click

Assign Table

↓

Customer Check-in Wizard opens

↓

Selected table already filled

↓

Continue check-in

Extend Time

Visible only for

Occupied

Expiring

Workflow

Click

Extend Time

↓

Extension Dialog opens

↓

Choose Extension

↓

Collect Payment

↓

Session Extended

↓

Timer Updates

Checkout

Visible only for

Occupied tables

Workflow

Click

Checkout

↓

Billing Screen

↓

Collect Payment

↓

Close Session

↓

Table becomes Available

Close

Closes Bottom Sheet.

No changes made.

Automatic Live Updates

The Tables Portal automatically refreshes

Session Timer
Customer Status
Table Status
Occupancy
Drink Balance
Extensions
Checkout Updates

No manual refresh required.

Business Rules

Available table

↓

Can Assign

Occupied table

↓

Cannot Assign

Reserved table

↓

Cannot Assign

Maintenance table

↓

Cannot Assign

Expired session

↓

Requires Checkout or Extension

Capacity exceeded

↓

Assignment blocked

Manager Mode

Managers have

Read Only access.

They can

View Tables
View Customer Details
Monitor Timers
View Reports

They cannot

Check-in Customers
Checkout Customers
Modify Tables
Extend Sessions
Backend APIs

Fetch Tables

GET /tables

Fetch Live Session

GET /sessions/active

Assign Table

POST /tables/assign

Extend Session

PUT /sessions/extend

Checkout

PUT /sessions/close
Database Operations

Read Table Status

↓

Read Active Session

↓

Read Customer

↓

Update Timer

↓

Update Occupancy

↓

Update Remaining Drinks

↓

Update Session Extension

↓

Release Table after Checkout

Success Flow

Open Tables Portal

↓

Choose Table

↓

View Details

↓

Perform Action

↓

Database Updated

↓

UI Refreshes Automatically

Failure Flow

Possible failures

Network Failure
Session Not Found
Table Already Occupied
Invalid Extension
Timer Already Expired
API Failure
Database Error

System displays appropriate error message without crashing.

Edge Cases
Two staff selecting same table simultaneously.
Customer checks out while another staff views details.
Session expires during payment.
Internet disconnects.
Customer leaves unexpectedly.
Table switched by admin.
Force Release executed.
Maintenance enabled while occupied.
UI Features

The Tables Portal includes

High contrast cards
Theme-aware colors
Light Mode support
Dark Mode support
Real-time countdown timer
Premium card borders
Dynamic status indicators
Responsive layouts
Bottom Sheet animations
Smooth state updates




Module 4 — Bartender Portal (Drink Redemption & Coupon Management)
Functional Details

Module Name: Bartender Portal

Page Name: Bartender Workspace

Purpose:
The Bartender Portal enables bartenders to validate customer sessions using either an NFC card or QR code, verify the remaining drink balance, redeem drink coupons, maintain redemption history, and prevent duplicate or unauthorized redemptions.

Who Can Access

Bartender
Admin
How to Reach

Login

↓

Staff Role (Bartender)

↓

Bartender Portal opens

Main Purpose

The Bartender Portal allows staff to:

Scan NFC Cards
Scan QR Codes
Verify Active Sessions
View Customer Details
Check Remaining Drinks
Redeem Drink Coupons
Prevent Duplicate Redemption
View Redemption History
Workflow Overview

Customer arrives at the counter.

↓

Customer presents

NFC Card
OR
QR Code

↓

Bartender scans it.

↓

System validates the session.

↓

Customer details appear.

↓

Bartender serves drink.

↓

Drink coupon redeemed.

↓

Remaining balance updated instantly.

Method 1 — NFC Scan
Step 1

Customer taps NFC Card on the device.

↓

Application starts NFC scanning.

Step 2

System reads

Session Token
Card ID

↓

Backend validates token.

Step 3

If valid

Customer details appear.

Displays

Customer Name
Table Number
Active Session
Remaining Drinks
Check-in Time
Step 4

Bartender confirms drink.

↓

Clicks

Redeem Drink

↓

Coupon deducted.

↓

Remaining balance decreases.

NFC Success Flow

Tap Card

↓

Read Token

↓

Validate Session

↓

Load Customer

↓

Redeem Drink

↓

Balance Updated

Method 2 — QR Scan
Step 1

Click

Scan QR

↓

Camera opens.

Step 2

Customer presents QR.

↓

Scan completed.

Step 3

Backend validates

QR Token
Active Session
Token Status
Step 4

Customer details displayed.

↓

Redeem Drink

↓

Balance Updated

Customer Information Display

After successful validation

Displays

Customer Name
Customer ID
Table Number
Session Status
Remaining Drinks
Drinks Redeemed
Session Expiry Time
Remaining Drinks

Example

Purchased Drinks

10

Redeemed

6

Remaining

4

Every redemption updates immediately.

Buttons
Scan NFC

Starts NFC Reader.

Scan QR

Opens Camera Scanner.

Redeem Drink

Redeems one drink coupon.

Updates

Remaining Drinks
Redemption History
Refresh

Reloads latest customer information.

Coupon Redemption Rules

One click

↓

One coupon deducted

Cannot redeem

Expired Session
Closed Session
Zero Balance
Invalid Customer
Invalid Token
Duplicate Protection

System prevents

Double Tap
Double Scan
Duplicate API Requests
Simultaneous Redemption
Same Coupon Twice
Redemption History

Every redemption stores

Customer
Bartender
Time
Table
Drink Count
Remaining Balance

Used for audit purposes.

Backend APIs

Validate NFC

POST /nfc/validate

Validate QR

POST /qr/validate

Redeem Coupon

POST /coupon/redeem

Customer Session

GET /sessions/:id
Database Operations

Read Session

↓

Read Remaining Drinks

↓

Create Redemption Record

↓

Update Drink Balance

↓

Save Transaction Log

↓

Refresh UI

Success Flow

Customer Arrives

↓

Scan NFC / QR

↓

Session Valid

↓

Customer Loaded

↓

Redeem Drink

↓

Database Updated

↓

Remaining Drinks Updated

↓

Success Message

Failure Flow

Possible failures

Invalid NFC Card
Invalid QR
Expired Session
Already Closed Session
No Remaining Drinks
Network Failure
API Failure
Duplicate Redemption Attempt

Application displays appropriate error message.

Business Rules
Only Active Sessions can redeem drinks.
One redemption deducts one drink.
Remaining drinks cannot become negative.
Expired sessions cannot redeem.
Closed sessions cannot redeem.
Duplicate redemption blocked.
Every redemption is logged.
Edge Cases
Customer scans same NFC card twice quickly.
Two bartenders scan the same customer simultaneously.
Internet disconnects during redemption.
Session expires while serving.
Customer has zero balance.
QR already invalidated.
NFC card unreadable.
API timeout.
UI Features

The Bartender Portal includes

Large scan buttons
Real-time customer information
High visibility drink balance
Success and error indicators
Dark Mode support
Light Mode support
Fast redemption workflow
Instant balance updates









Module 5 — Session Management (Active Sessions, Session Extension, Expiry & Checkout)
Functional Details

Module Name: Session Management

Pages Included:

Active Sessions
Session Details
Extend Session
Checkout
Session History

Purpose:
The Session Management module is responsible for monitoring every active customer session from check-in until checkout. It tracks session duration, remaining time, drink balance, payment status, session extensions, expiration alerts, and checkout operations.

Who Can Access

Admin
Staff

Manager can only view session details (Read Only).

How to Reach

Login

↓

Dashboard

↓

Tables Portal

↓

Select Occupied Table

↓

Session Details opens

OR

Dashboard

↓

Active Sessions

Main Purpose

The module allows users to

View all active sessions
Monitor remaining session time
Extend customer sessions
Receive expiry alerts
Checkout customers
View completed session history
Active Session Information

Every active session displays

Customer Name
Table Number
Check-in Time
Session Start Time
Remaining Time
Total Purchased Duration
Remaining Drinks
Payment Status
Session Status
Session Status Types
Active

Customer currently occupies the table.

Timer is running.

Available Actions

View Details
Extend Session
Checkout
Expiring Soon

Customer has less than 15 minutes remaining.

Application displays warning.

Available Actions

Extend Session
Checkout
Expired

Allocated session time has finished.

Customer should either

Extend Session

OR

Checkout
Closed

Customer completed checkout.

Session becomes read-only.

Appears in History.

Live Countdown Timer

Every active session has a countdown timer.

Example

01:45:20 Remaining

Timer updates automatically without refreshing the page.

15 Minute Expiry Warning

When remaining time becomes

15 Minutes

↓

Application displays

⚠ Session Expiring Soon

Staff can immediately extend the session.

Extend Session Workflow
Step 1

Open Session Details.

↓

Click

Extend Time

Step 2

Extension dialog opens.

Displays

Current Remaining Time
Available Extension Plans
Extension Cost
Step 3

Staff selects extension.

Example

+30 Minutes
+1 Hour
+2 Hours
Step 4

Collect Payment.

↓

Confirm Extension.

Step 5

Backend updates

Session Duration
Expiry Time
Payment Record

↓

Timer refreshes immediately.

Extension Success Flow

Open Session

↓

Extend Time

↓

Choose Duration

↓

Collect Payment

↓

Update Database

↓

Refresh Timer

↓

Continue Session

Checkout Workflow
Step 1

Open Active Session.

↓

Click

Checkout

Step 2

Billing Summary appears.

Displays

Total Session Time
Purchased Duration
Extended Duration
Drinks Used
Remaining Drinks
Total Amount
Pending Amount
Step 3

Collect Final Payment.

↓

Confirm Checkout.

Step 4

Application performs

Close Session
Release Table
Deactivate NFC/QR Token
Archive Session
Update Reports
Step 5

Table becomes

Available

Customer leaves.

Checkout Success Flow

Open Session

↓

Billing Summary

↓

Collect Payment

↓

Checkout

↓

Session Closed

↓

Table Released

↓

Customer Leaves

Session History

Closed sessions move to history.

History displays

Customer Name
Table Number
Check-in Time
Checkout Time
Total Duration
Total Payment
Drinks Redeemed

History is read-only.

Backend APIs

Get Active Sessions

GET /sessions/active

Session Details

GET /sessions/:id

Extend Session

PUT /sessions/extend

Checkout

PUT /sessions/checkout

Session History

GET /sessions/history
Database Operations

Read Active Session

↓

Update Remaining Time

↓

Create Extension Record

↓

Update Payment

↓

Close Session

↓

Release Table

↓

Deactivate Token

↓

Move Session to History

Business Rules
Only Active sessions can be extended.
Expired sessions require either extension or checkout.
Closed sessions cannot be modified.
Payment must be completed before extension.
Checkout releases the table immediately.
One active session per table.
Session history cannot be edited.
Failure Scenarios

Possible failures

Payment failed
Session already closed
Session expired during payment
API timeout
Database failure
Network disconnect
Invalid extension request

System prevents inconsistent data and shows an appropriate error.

Edge Cases
Two staff attempt to extend the same session.
Checkout initiated while extension dialog is open.
Internet disconnects during checkout.
Customer leaves without payment.
Timer reaches zero during payment.
Duplicate checkout request.
Customer requests multiple extensions.
UI Features

The Session Management module includes

Live countdown timer
Expiry warning badges
Payment summary dialog
Extension popup
Responsive session cards
Theme-aware colors
Automatic timer refresh
Smooth UI transitions







Module 6 — NFC Card Management
Functional Details

Module Name: NFC Card Management

Pages Included:

NFC Card Inventory
Card Assignment
Write NFC Card
Card Validation
Replace Card
Release Card
Card History

Purpose:
The NFC Card Management module manages the complete lifecycle of NFC cards used within the system. It handles card registration, writing secure session tokens, assigning cards to customers, validating cards during usage, replacing lost or damaged cards, releasing cards after checkout, and maintaining a complete audit history.

Who Can Access

Admin
Reception Staff

Bartenders can only read/validate cards. They cannot assign or replace cards.

How to Reach

Login

↓

Dashboard

↓

NFC Card Management

OR

Customer Check-in

↓

Delivery Method

↓

NFC Card

Main Purpose

The module allows users to

Register NFC Cards
Assign Cards
Write Session Data
Validate Cards
Replace Cards
Release Cards
View Card History
NFC Card Lifecycle

Blank Card

↓

Available

↓

Assigned

↓

Written

↓

Active

↓

Validated

↓

Released

↓

Available Again

Card Status Types
Available

Card is ready for assignment.

Can be written.

Assigned

Card belongs to an active customer session.

Cannot be reassigned.

Active

Customer is currently using the card.

Session is running.

Released

Customer completed checkout.

Card becomes reusable.

Disabled

Card is damaged, blocked, or removed from circulation.

Cannot be used.

Card Assignment Workflow
Step 1

Customer completes registration.

↓

Select

NFC Card

Step 2

System displays available NFC cards.

Reception staff selects one.

Step 3

System checks

Card available
Card not assigned
Card active status
Card integrity
Step 4

Card is linked to customer session.

↓

Ready for writing.

NFC Write Workflow
Step 1

Reception staff clicks

Write Card

Step 2

Application requests NFC permission.

Step 3

Staff places NFC card near device.

Step 4

Application writes

Secure Session Token
Session ID
Customer Reference
Security Metadata
Step 5

Verification read is performed.

If successful

↓

Card becomes Active.

Session Activated.

NFC Validation Workflow

Whenever customer taps the card

↓

Application reads token.

↓

Backend verifies

Token exists
Session active
Card active
Not expired

↓

Customer details loaded.

Replace Card Workflow

Used when

Card lost
Card damaged
Card unreadable

Workflow

Open Customer Session

↓

Replace Card

↓

Old Card Disabled

↓

New Card Assigned

↓

Write New Card

↓

Session continues

Release Card Workflow

Occurs during checkout.

Checkout

↓

Deactivate Session

↓

Clear Card Assignment

↓

Card becomes Available

↓

Ready for next customer

Card History

Every NFC operation is logged.

History includes

Card ID
Customer
Assignment Time
Release Time
Replacement History
Staff Member
Device Used
Security Features

Each card contains

Secure Token
Session Mapping
Validation Data

The application prevents

Duplicate assignments
Invalid cards
Fake tokens
Expired sessions
Unauthorized access
Backend APIs

Available Cards

GET /nfc/cards

Assign Card

POST /nfc/assign

Write Card

POST /nfc/write

Validate Card

POST /nfc/validate

Replace Card

PUT /nfc/replace

Release Card

PUT /nfc/release
Database Operations

Read Available Card

↓

Assign Card

↓

Write Session Mapping

↓

Update Card Status

↓

Validate Card

↓

Release Card

↓

Archive History

Business Rules
One card can belong to only one active session.
One customer can have only one active NFC card.
Assigned cards cannot be reused.
Released cards become available again.
Disabled cards cannot be assigned.
Invalid cards are rejected immediately.
Session must be active for validation.
Failure Scenarios

Possible failures

NFC disabled
Unsupported device
Card removed early
Write failed
Read failed
Invalid card
Duplicate assignment
Network failure
Backend unavailable

The application displays appropriate error messages and prevents inconsistent data.

Edge Cases
Customer taps wrong card.
Staff writes the same card twice.
Card removed during write.
Card physically damaged.
Customer loses card during session.
Two staff attempt to assign the same card simultaneously.
Internet disconnects while writing.
Validation attempted after checkout.
UI Features

The NFC Card Management module includes

Card status indicators
Write progress dialog
Validation success/failure messages
Card inventory list
Assignment confirmation
Replace card dialog
History screen
Theme-aware design
Responsive layouts










Module 7 — QR Code Management & Email QR Workflow
Functional Details

Module Name: QR Code Management & Email QR Workflow

Pages Included:

QR Generation
Email QR Delivery
QR Validation
QR Scanner
Pending Sessions
QR Activation
QR Expiration

Purpose:
The QR Code Management module provides a contactless check-in mechanism for customers who do not use NFC cards. It securely generates unique QR codes, delivers them through email, validates them during customer arrival, activates customer sessions, and prevents duplicate or fraudulent usage.

Who Can Access

Admin
Reception Staff

Customers receive the QR via email and present it during check-in.

How to Reach

Dashboard

↓

Customer Check-in

↓

Select

Email QR

Main Purpose

The module allows users to

Generate Secure QR
Send QR via Email
Verify QR
Activate Customer Session
Prevent Duplicate Usage
Handle Expired QR Codes
QR Lifecycle

Customer Registered

↓

QR Generated

↓

Email Sent

↓

Pending Session

↓

Customer Arrives

↓

QR Scanned

↓

QR Verified

↓

Payment Completed

↓

Session Activated

↓

QR Marked Used

QR Status Types
Generated

QR has been created successfully.

Sent

QR email delivered.

Pending

Waiting for customer arrival.

Active

QR has been verified.

Customer session running.

Used

QR already consumed.

Cannot reuse.

Expired

QR validity period ended.

Cannot activate.

Cancelled

Customer booking cancelled.

QR invalidated.

QR Generation Workflow
Step 1

Reception staff completes customer registration.

↓

Select

Email QR

Step 2

Enter customer email.

Validation

Required
Valid Email Format
Step 3

Click

Generate QR

Step 4

Backend generates

Unique QR Token
Session Token
Expiry Time
Customer Mapping
Step 5

QR Image generated.

↓

Email prepared.

↓

Customer receives QR.

Email Delivery Workflow

Application prepares email.

↓

Includes

Customer Name
QR Code
Booking Details
Validity Information
Instructions

↓

Email sent successfully.

↓

Pending Session created.

Customer Arrival Workflow

Customer arrives.

↓

Shows QR from mobile.

↓

Reception clicks

Scan QR

↓

Camera opens.

QR Validation Workflow

Application reads QR.

↓

Backend validates

Token Exists
Token Active
Not Expired
Not Used
Customer Exists

↓

Validation Success

↓

Customer Details Displayed

Session Activation Workflow

Reception assigns available table.

↓

Collect Payment.

↓

Click

Activate Session

↓

System performs

Session Active
Table Occupied
QR Used
Pending Removed
QR Success Flow

Register Customer

↓

Generate QR

↓

Email Sent

↓

Customer Arrives

↓

Scan QR

↓

Verify Token

↓

Assign Table

↓

Payment

↓

Activate Session

↓

Customer Seated

QR Failure Flow

Possible failures

Invalid QR
Expired QR
Already Used QR
Customer Cancelled
Network Failure
QR Damaged
API Failure

Application displays appropriate message.

Pending Sessions

Every generated QR creates a Pending Session.

Pending Sessions display

Customer Name
Email
Generated Time
Expiry Time
Current Status

Staff can

Activate
Cancel
Resend Email
Delete Pending Session
QR Expiration

QR automatically expires after configured duration.

Expired QR

↓

Cannot activate.

Customer must receive a new QR.

QR Security

Every QR contains

Secure Token
Customer Mapping
Expiry Timestamp
Session Identifier

System prevents

Duplicate scans
Token tampering
Reuse attacks
Expired activation
Unauthorized access
Backend APIs

Generate QR

POST /qr/generate

Send Email

POST /email/send-qr

Validate QR

POST /qr/validate

Activate Session

POST /sessions/activate

Pending Sessions

GET /sessions/pending

Cancel Pending

DELETE /sessions/pending/:id
Database Operations

Create Customer

↓

Generate QR Token

↓

Store Pending Session

↓

Store Email Status

↓

Validate QR

↓

Activate Session

↓

Update Table Status

↓

Mark QR Used

↓

Archive Session

Business Rules
One QR belongs to one customer.
QR can be used only once.
Expired QR cannot be activated.
Payment required before activation.
One pending session per customer.
Cancelled QR becomes permanently invalid.
Used QR cannot be regenerated for the same session.
Failure Scenarios

Possible failures

Invalid email
Email delivery failed
QR image generation failed
Duplicate customer
QR expired
QR already scanned
Internet disconnected
Backend unavailable
Edge Cases
Customer deletes email.
QR scanned twice.
Customer arrives after expiry.
Email delayed.
Payment cancelled after QR verification.
Two staff scan same QR simultaneously.
Customer requests QR resend.
Customer changes email before arrival.
UI Features

The QR Management module includes

QR Preview
Email Status Badge
Pending Session Cards
QR Scanner Screen
Validation Success Dialog
Error Messages
Expiry Indicators
Responsive Layout
Dark & Light Theme Support















Module 8 — Payment Management & Billing Workflow
Functional Details

Module Name: Payment Management & Billing

Pages Included:

Payment Collection
Billing Summary
Session Extension Payment
Checkout Payment
Transaction History
Payment Confirmation

Purpose:
The Payment Management module handles all customer payment transactions throughout the customer lifecycle. It manages initial check-in payments, session extension payments, checkout settlements, billing calculations, payment verification, and transaction history while ensuring accurate financial records.

Who Can Access

Admin
Reception Staff

Managers have read-only access to payment history and reports.

How to Reach

Customer Check-in

↓

Payment Screen

OR

Active Session

↓

Extend Session

↓

Payment

OR

Checkout

↓

Billing Summary

↓

Payment

Main Purpose

The module allows users to

Collect Initial Payment
Generate Billing Summary
Process Session Extension Payments
Complete Checkout Payments
Record Transactions
View Payment History
Payment Lifecycle

Customer Check-in

↓

Initial Payment

↓

Session Active

↓

Extension Payment (Optional)

↓

Final Checkout

↓

Billing Complete

↓

Transaction Archived

Payment Status Types
Pending

Payment has not yet been collected.

Paid

Payment successfully completed.

Partial

Only part of the amount has been received.

Failed

Payment unsuccessful.

Cancelled

Payment cancelled before completion.

Refunded

Payment returned to customer (if supported).

Initial Check-in Payment Workflow
Step 1

Customer registration completed.

↓

Table assigned.

↓

System calculates

Entry Charge
Package Price
Taxes (if applicable)
Step 2

Billing Summary displayed.

Shows

Customer Name
Table Number
Session Duration
Package Details
Total Amount
Step 3

Reception collects payment.

↓

Click

Confirm Payment

Step 4

Backend stores payment.

↓

Session activated.

Session Extension Payment
Step 1

Customer requests additional time.

↓

Click

Extend Session

Step 2

Select extension plan.

Example

+30 Minutes
+1 Hour
+2 Hours
Step 3

System calculates extension amount.

↓

Displays updated bill.

Step 4

Collect payment.

↓

Confirm.

↓

Session timer updated.

Checkout Payment Workflow
Step 1

Click

Checkout

Step 2

System calculates

Initial Payment
Extension Charges
Additional Charges
Discounts (if applicable)
Remaining Balance
Step 3

Billing Summary shown.

Displays

Customer Name
Table
Session Duration
Drinks Redeemed
Total Paid
Pending Amount
Final Total
Step 4

Collect remaining payment.

↓

Click

Complete Checkout

Step 5

Session closes.

↓

Table released.

↓

Payment archived.

Billing Summary

The billing screen displays

Customer Information
Session Duration
Check-in Time
Checkout Time
Package Purchased
Extension Details
Drinks Redeemed
Additional Charges
Taxes
Grand Total
Transaction History

Every payment stores

Transaction ID
Customer Name
Session ID
Table Number
Payment Amount
Payment Time
Staff Name
Payment Type
Payment Status
Receipt Generation

After successful payment

System can generate

Digital Receipt
Printable Receipt
Payment Confirmation

Receipt contains

Business Details
Customer Details
Payment Breakdown
Transaction Reference
Date & Time
Backend APIs

Create Payment

POST /payments/create

Billing Summary

GET /payments/summary/:sessionId

Extension Payment

POST /payments/extension

Checkout Payment

POST /payments/checkout

Transaction History

GET /payments/history

Receipt

GET /payments/receipt/:id
Database Operations

Create Payment Record

↓

Update Session Payment Status

↓

Store Billing Information

↓

Store Transaction

↓

Update Checkout Status

↓

Archive Payment History

Business Rules
Initial payment required before session activation.
Extension requires payment confirmation.
Checkout cannot complete with pending balance.
Every payment generates a transaction record.
Transaction history cannot be edited.
Closed sessions cannot receive new payments.
Duplicate payment requests are prevented.
Failure Scenarios

Possible failures

Payment cancelled
Payment failed
Duplicate payment request
Network failure
Backend unavailable
Invalid session
Billing mismatch
API timeout

Application displays appropriate error messages and prevents incomplete transactions.

Edge Cases
Customer changes extension after payment.
Internet disconnects during payment.
Duplicate checkout attempt.
Session expires while payment is in progress.
Staff accidentally clicks payment twice.
Customer leaves before settlement.
Invalid billing calculation.
Transaction saved but response delayed.
UI Features

The Payment module includes

Billing Summary Cards
Payment Confirmation Dialog
Success/Error Notifications
Transaction History Screen
Receipt Preview
Theme-aware UI
Responsive Layout
Real-time Bill Updates
Payment Flow Diagram

Customer Check-in

↓

Table Assigned

↓

Billing Generated

↓

Payment Collected

↓

Session Activated

↓

(Optional)

Session Extension

↓

Extension Payment

↓

Customer Checkout

↓

Final Billing

↓

Remaining Payment

↓

Checkout Complete
Module 9 — Reports & Analytics
Functional Details

Module Name: Reports & Analytics

Pages Included

Dashboard Overview
Sales Reports
Revenue Analytics
Table Utilization
Customer Analytics
Session Analytics
Drink Redemption Reports
Hourly Breakdown
Daily Reports
Weekly Reports
Monthly Reports
Export Reports
Purpose

The Reports & Analytics module provides complete business insights by collecting and presenting operational data from all system modules. It enables managers and administrators to monitor business performance, customer activity, table occupancy, sales, and overall system health through interactive dashboards and reports.

Who Can Access

✅ Admin

✅ Manager

Reception staff generally have limited or no access depending on system permissions.

How to Reach

Login

↓

Dashboard

↓

Reports & Analytics

Main Purpose

This module allows users to:

View business performance
Monitor sales revenue
Analyze customer visits
Track table occupancy
Monitor active and completed sessions
Review payment statistics
Analyze drink redemption
Export reports
Monitor real-time KPIs
Dashboard Overview

The dashboard provides a quick summary of business metrics.

Displays:

Today's Revenue
Today's Customers
Active Sessions
Completed Sessions
Occupied Tables
Available Tables
Pending Check-ins
QR Sessions
NFC Sessions
Total Payments
Extension Requests
Average Session Duration

These values refresh automatically as new activities occur.

Sales Report Workflow

Customer Payment

↓

Payment Saved

↓

Revenue Updated

↓

Sales Report Updated

↓

Dashboard Refresh

Sales reports include:

Daily Sales
Weekly Sales
Monthly Sales
Total Revenue
Average Revenue
Revenue Trends
Customer Analytics Workflow

Customer Registration

↓

Customer Check-in

↓

Session Active

↓

Checkout

↓

Customer Statistics Updated

Statistics include:

Total Customers
New Customers
Returning Customers
Customer Growth
Average Visit Duration
Most Active Customers
Table Utilization Workflow

Customer Assigned

↓

Table Occupied

↓

Session Running

↓

Checkout

↓

Table Released

↓

Utilization Updated

Metrics include:

Available Tables
Occupied Tables
Reserved Tables
Average Occupancy Time
Peak Utilization Hours
Session Analytics Workflow

Every customer session updates analytics.

Tracks:

Active Sessions
Completed Sessions
Cancelled Sessions
Expired Sessions
Extended Sessions
Average Session Duration
Drink Redemption Analytics

Whenever drinks are redeemed:

↓

Redemption Stored

↓

Customer Updated

↓

Sales Updated

↓

Analytics Updated

Displays:

Total Drinks Redeemed
Most Popular Drinks
Redemption Trends
Redemption Frequency
Hourly Breakdown

Displays customer traffic based on time.

Example

09:00

↓

5 Customers

10:00

↓

8 Customers

11:00

↓

14 Customers

...

Managers can identify peak business hours.

Daily Report

Includes:

Revenue
Customers
Active Sessions
Completed Sessions
Payments
Extensions
Occupied Tables
Available Tables
Weekly Report

Shows:

Daily Revenue
Weekly Growth
Customer Trends
Session Trends
Occupancy Analysis
Monthly Report

Displays

Monthly Revenue
Business Growth
Customer Retention
Most Popular Packages
Peak Hours
Table Performance
Export Reports

Managers can export reports.

Supported formats may include:

PDF
Excel
CSV

Exported reports contain

Charts
Tables
Revenue
Customer Statistics
Session Data
Dashboard Widgets

Typical dashboard cards include:

Revenue Card
Active Sessions Card
Occupied Tables Card
Pending Check-ins
Customer Count
Payment Summary
QR Usage
NFC Usage
Graphs & Charts

The dashboard may display:

Revenue Trend Graph
Customer Growth Graph
Table Utilization Chart
Hourly Activity Chart
Session Distribution Chart
Payment Trend Graph
Backend APIs

Dashboard Summary

GET /reports/dashboard

Sales Report

GET /reports/sales

Table Utilization

GET /reports/table-utilization

Hourly Breakdown

GET /reports/hourly-breakdown

Customer Analytics

GET /reports/customers

Session Analytics

GET /reports/sessions

Export Report

POST /reports/export
Database Operations

Read Payments

↓

Read Sessions

↓

Read Tables

↓

Read Customers

↓

Aggregate Statistics

↓

Generate Reports

↓

Return Dashboard Data

Business Rules
Reports are generated from live production data.
Completed payments contribute to revenue.
Active sessions affect occupancy.
Cancelled sessions are excluded from revenue.
Dashboard refreshes automatically.
Reports are filtered based on selected date ranges.
User permissions control report visibility.
Failure Scenarios

Possible failures include:

API timeout
Database unavailable
Network interruption
Empty data for selected period
Export generation failure
Permission denied

The system displays appropriate error messages and allows retry where applicable.

Edge Cases
No business activity for selected date.
Simultaneous updates while viewing reports.
Large datasets causing slow loading.
Export interrupted midway.
Session deleted after report generation.
Duplicate payment correction affecting reports.
UI Features

The Reports & Analytics module includes:

KPI Summary Cards
Interactive Charts
Data Tables
Date Range Filters
Search Options
Export Buttons
Auto Refresh
Responsive Layout
Light & Dark Theme Support
Reports Flow Diagram

Customer Activity

↓

Session Created

↓

Payment Completed

↓

Database Updated

↓

Analytics Engine

↓

Dashboard Metrics Updated

↓

Charts Refreshed

↓

Reports Available

↓

Export Reports








Module 10 — User Management, Roles & System Settings
Functional Details

Module Name: User Management, Roles & System Settings

Pages Included

User Management
Create User
Edit User
Role Management
Permissions
User Profile
Change Password
System Settings
Notification Settings
Security Settings
Audit Logs
Purpose

The User Management & System Settings module controls who can access the application, what actions each user can perform, and how the overall system is configured. It provides secure authentication, role-based access control (RBAC), profile management, application preferences, notification settings, and complete audit logging for administrative monitoring.

Who Can Access
Admin
Full Access
Manage Users
Manage Roles
Configure System
View Audit Logs
Reset Passwords
Manager
Dashboard
Reports
Limited User View
Own Profile
Reception Staff
Customer Management
Check-in
Checkout
NFC
QR
Own Profile
Bartender
Drink Redemption
Session Verification
Own Profile
How to Reach

Login

↓

Dashboard

↓

Settings

↓

User Management

OR

Profile Icon

↓

My Profile

Main Purpose

The module allows administrators to:

Create Users
Edit Users
Delete Users
Assign Roles
Configure Permissions
Reset Passwords
Update System Preferences
Monitor Audit Logs
User Lifecycle

Create User

↓

Assign Role

↓

Activate Account

↓

User Login

↓

Daily Operations

↓

Profile Updates

↓

Deactivate User

↓

Archive User

User Status Types
Active

User can access the application.

Inactive

User account disabled.

Login blocked.

Suspended

Temporary restriction.

No access allowed.

Deleted

Archived user.

Cannot log in.

Create User Workflow
Step 1

Admin clicks

Create User

Step 2

Enter

Full Name
Email
Phone Number
Username
Password
Role
Step 3

Validation

Required fields
Unique username
Valid email
Password policy
Step 4

Save User

↓

Database updated.

↓

User receives access.

Edit User Workflow

Admin opens user.

↓

Modify

Name
Email
Phone
Role
Status

↓

Save

↓

System updates immediately.

Role Management

Roles determine what users can access.

Example Roles

Admin
Manager
Reception
Bartender

Each role contains a predefined permission set.

Permission Management

Permissions include access to:

Dashboard
Reports
Customer Module
NFC Module
QR Module
Payments
Tables
Orders
Settings
User Management

The application checks permissions before every protected action.

Profile Management

Every user can:

View Profile
Update Name
Update Phone Number
Change Password
View Assigned Role

Users cannot modify their own role.

Password Change Workflow

User

↓

Profile

↓

Change Password

↓

Enter Current Password

↓

Enter New Password

↓

Confirm Password

↓

Save

↓

Password Updated

System Settings

Administrators can configure:

Business Name
Contact Information
Time Zone
Session Duration
Default Expiry Time
Extension Duration
Notification Preferences
Theme Options
Notification Settings

System notifications include:

Session Expiry
Payment Confirmation
QR Generated
NFC Write Success
Extension Requests
System Errors

Notifications can be enabled or disabled based on requirements.

Security Settings

Security configurations include:

Password Policy
Session Timeout
Login Restrictions
API Security
Token Validation
Role Authorization
Audit Logs

Every important activity is recorded.

Examples:

User Login
Logout
Customer Created
Payment Completed
Session Extended
User Updated
Settings Changed
Password Reset
Role Modified

Each log contains:

Timestamp
User
Action
Module
Result
IP Address (if configured)
Backend APIs

Get Users

GET /users

Create User

POST /users

Update User

PUT /users/:id

Delete User

DELETE /users/:id

User Profile

GET /profile

Update Profile

PUT /profile

Change Password

POST /profile/change-password

Roles

GET /roles

Permissions

GET /permissions

Audit Logs

GET /audit-logs

System Settings

GET /settings

Update Settings

PUT /settings
Database Operations

Create User

↓

Assign Role

↓

Store Permissions

↓

Update Profile

↓

Save Settings

↓

Record Audit Log

↓

Return Response

Business Rules
Every user must have exactly one role.
Only Admins can manage users and roles.
Deleted users cannot log in.
Passwords must satisfy security policies.
Audit logs cannot be modified or deleted.
Users can edit only their own profile.
Permission checks are enforced before every protected operation.
Failure Scenarios

Possible failures include:

Duplicate username
Duplicate email
Invalid password
Unauthorized access
Permission denied
Session expired
Database unavailable
Network interruption

Appropriate validation and error messages are displayed to the user.

Edge Cases
Admin accidentally removes own permissions.
Multiple admins edit the same user simultaneously.
Password reset interrupted.
User attempts to access restricted modules.
Inactive user attempts login.
Session expires while editing settings.
Duplicate role assignment.
Unauthorized API request.
UI Features

The User Management & Settings module includes:

User List
Search & Filters
Role Badges
Status Indicators
Create/Edit User Dialogs
Profile Screen
Password Change Dialog
Settings Forms
Toggle Switches
Audit Log Table
Responsive Layout
Light & Dark Theme Support
User Management Flow Diagram

Admin Login

↓

User Management

↓

Create User

↓

Assign Role

↓

Activate Account

↓

User Login

↓

Application Access

↓

Audit Log Updated










Module 11 — Notifications, Error Handling, Offline Sync & Complete System Lifecycle
Functional Details

Module Name: Notifications, Error Handling, Offline Synchronization & System Lifecycle

Pages Included

Notification Center
Session Notifications
Payment Notifications
Offline Sync Queue
Error Logs
Network Status
System Health
Activity Timeline
Purpose

This module ensures the application remains reliable, responsive, and fault-tolerant. It manages real-time notifications, offline data synchronization, API retry mechanisms, network monitoring, error handling, audit events, and the complete end-to-end lifecycle of customer sessions.

Who Can Access
Admin
View all notifications
View error logs
Monitor synchronization
Monitor system health
Manager
Business notifications
Session alerts
Reports
Reception Staff
Customer notifications
Session expiry alerts
Payment notifications
Offline sync status
Bartender
Drink redemption alerts
Customer validation alerts
Main Purpose

This module allows the system to:

Display real-time notifications
Handle network failures
Queue offline requests
Retry failed API calls
Synchronize data automatically
Display error messages
Maintain system consistency
Monitor application health
Notification Categories
Session Notifications
Customer Checked In
Session Activated
Session Extended
Session Expired
Customer Checked Out
Payment Notifications
Payment Success
Payment Failed
Extension Payment Received
Checkout Completed
QR Notifications
QR Generated
QR Sent
QR Scanned
QR Expired
QR Validation Failed
NFC Notifications
Card Assigned
Card Written Successfully
NFC Validation Success
NFC Write Failed
Card Released
System Notifications
Server Connected
Internet Lost
Sync Completed
Update Available
Maintenance Notice
Notification Workflow

Application Event

↓

Backend Updates Database

↓

Notification Generated

↓

Frontend Receives Event

↓

Display Toast

↓

Update Notification Center

↓

User Continues Workflow

Session Expiry Notification

Customer Session Running

↓

15 Minutes Remaining

↓

Warning Notification Displayed

↓

Reception Staff Notified

↓

Extend Session

OR

Proceed to Checkout

Offline Synchronization Workflow

Network Available

↓

API Request Sent

↓

Success

↓

Complete

If Internet Lost

↓

Request Stored

↓

Offline Queue

↓

Internet Restored

↓

Automatic Retry

↓

Backend Updated

↓

Queue Cleared

Offline Queue

The application stores pending operations.

Examples

Customer Check-in
Session Extension
Payment Confirmation
Table Update
Drink Redemption

These requests remain queued until connectivity returns.

API Retry Workflow

API Request

↓

Timeout

↓

Retry #1

↓

Retry #2

↓

Retry #3

↓

Still Failed

↓

Store Offline

↓

Notify User

Network Monitoring

Application continuously monitors:

Internet Connectivity
Backend Availability
API Latency
Synchronization Status

Status Examples

🟢 Online

🟡 Slow Connection

🔴 Offline

Error Handling

Common Errors

Validation Errors
Invalid Email
Missing Customer Name
Invalid Phone Number
Business Errors
Table Occupied
QR Already Used
NFC Already Assigned
Session Expired
Payment Pending
Network Errors
API Timeout
Server Offline
Connection Lost
System Errors
Database Failure
Internal Server Error
Unknown Exception
Error Recovery

Application attempts:

Retry

↓

Fallback

↓

Offline Queue

↓

Synchronization

↓

Success

OR

Display Error

System Health Monitoring

Monitors

Backend Status
Database Connectivity
API Availability
Active Sessions
Failed Requests
Synchronization Queue
Server Response Time
Activity Timeline

Displays chronological activities.

Examples

08:00

↓

Customer Registered

08:02

↓

QR Generated

08:05

↓

Payment Completed

08:06

↓

Session Activated

09:10

↓

Session Extended

10:05

↓

Checkout Completed

Backend APIs

Notifications

GET /notifications

Mark Notification Read

PUT /notifications/read/:id

Sync Queue

POST /sync

Retry Failed Requests

POST /sync/retry

System Health

GET /system/health

Error Logs

GET /logs/errors

Activity Timeline

GET /activity
Database Operations

Application Event

↓

Database Updated

↓

Notification Created

↓

Audit Log Created

↓

Sync Queue Updated

↓

User Interface Refreshed

Business Rules
Notifications are generated only for successful business events.
Failed requests are automatically retried.
Offline requests are synchronized once internet is restored.
Duplicate notifications are prevented.
Synchronization preserves operation order.
Error logs are immutable for auditing.
Critical failures require administrator attention.
Failure Scenarios

Possible failures include:

Internet disconnected
Backend unavailable
API timeout
Database failure
Sync conflict
Duplicate requests
Unauthorized request
Token expired

The application automatically attempts recovery wherever possible and informs the user if manual action is required.

Edge Cases
Customer check-in while offline.
Payment confirmed after internet restoration.
Multiple devices syncing simultaneously.
QR validation during intermittent connectivity.
NFC write interrupted by network loss.
Duplicate offline requests after reconnect.
Session expiry during synchronization.
Backend restart while users are active.
UI Features

The module includes:

Notification Bell
Toast Messages
Success Alerts
Warning Alerts
Error Dialogs
Offline Banner
Sync Progress Indicator
Network Status Indicator
Activity Timeline
Error Log Viewer
Responsive Layout
Light & Dark Theme Support
Complete End-to-End System Lifecycle

Customer Arrives

↓

Reception Registers Customer

↓

Delivery Method Selected

↓

NFC Card OR Email QR Generated

↓

Customer Verification

↓

Available Table Assigned

↓

Payment Collected

↓

Session Activated

↓

Bartender Validates Customer

↓

Drink Redemption

↓

Session Running

↓

Expiry Notification (15 Minutes Before)

↓

(Optional) Session Extension

↓

Extension Payment

↓

Session Continues

↓

Customer Checkout

↓

Final Billing

↓

Payment Settlement

↓

Table Released

↓

NFC Card Released / QR Marked Used

↓

Reports Updated

↓

Audit Logs Stored

↓

Notifications Generated

↓

Session Archived

Complete System Architecture Flow

Authentication

↓

Customer Management

↓

QR / NFC Management

↓

Table Assignment

↓

Payment Processing

↓

Active Session

↓

Drink Redemption

↓

Notifications

↓

Session Extension

↓

Checkout

↓

Reporting

↓

Audit Logs

↓

System Analytics


↓

Transaction History










