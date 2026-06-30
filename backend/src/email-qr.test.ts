import assert from 'assert';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import router from './routes';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/api', router);

const PORT = 4006;
const BASE_URL = `http://localhost:${PORT}/api`;

async function cleanupDb() {
  console.log('Cleaning up database for Email QR tests...');
  await prisma.syncLog.deleteMany({});
  await prisma.redemption.deleteMany({});
  await prisma.tokenExtension.deleteMany({});
  await prisma.tableOccupancyLog.deleteMany({});
  await prisma.token.deleteMany({});
  await prisma.customer.deleteMany({});
  
  // Reset all cards to available
  await prisma.card.updateMany({
    data: { status: 'available' }
  });

  // Check and upsert system config seed
  await prisma.systemConfig.upsert({
    where: { configKey: 'nfc_card_enabled' },
    update: { configValue: 'true' },
    create: { configKey: 'nfc_card_enabled', configValue: 'true' }
  });
  await prisma.systemConfig.upsert({
    where: { configKey: 'email_qr_enabled' },
    update: { configValue: 'false' },
    create: { configKey: 'email_qr_enabled', configValue: 'false' }
  });

  console.log('Cleaned up database.');
}

async function runTests() {
  const server = app.listen(PORT, async () => {
    console.log(`Email QR Test server running on port ${PORT}`);

    try {
      await cleanupDb();

      // 1. Get Auth Token
      console.log('Logging in...');
      const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
      });
      const loginData: any = await loginRes.json();
      assert.strictEqual(loginRes.status, 200, 'Login failed');
      const jwtToken = loginData.token || loginData.accessToken;
      assert.ok(jwtToken, 'Token missing');

      // Get seeded IDs
      const ptStanding = await prisma.placeTypeConfig.findFirst({ where: { name: 'STANDING_BAR' } });
      const tableS2 = await prisma.table.findFirst({ where: { tableNumber: 'S-02' } });
      const tableS3 = await prisma.table.findFirst({ where: { tableNumber: 'S-03' } });
      const card3 = await prisma.card.findFirst({ where: { nfcUid: 'CARD-003' } });

      assert.ok(ptStanding, 'STANDING_BAR is missing');
      assert.ok(tableS2, 'Table S-02 is missing');
      assert.ok(tableS3, 'Table S-03 is missing');
      assert.ok(card3, 'Card CARD-003 is missing');

      const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
      assert.ok(adminUser, 'Admin user is missing');

      // Test 1: Validate configured delivery mode retrieval (Initial should be NFC_CARD)
      console.log('Test 1: GET /config/delivery-mode');
      const getModeRes = await fetch(`${BASE_URL}/config/delivery-mode`, {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      const modeData: any = await getModeRes.json();
      assert.strictEqual(getModeRes.status, 200);
      assert.strictEqual(modeData.deliveryMode, 'NFC_CARD');
      console.log('✓ Initial mode verified as NFC_CARD.');

      // Test 2: Try to check in under NFC_CARD mode without cardUid (should fail)
      console.log('Test 2: Check-in under NFC_CARD mode without Card UID (should fail)');
      const checkinFailNfcRes = await fetch(`${BASE_URL}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          phoneNumber: '9999999991',
          customerName: 'NFC Test Customer',
          personsCount: 2,
          placeTypeId: ptStanding.id,
          tableId: tableS2.id
        })
      });
      assert.strictEqual(checkinFailNfcRes.status, 400);
      const failNfcData: any = await checkinFailNfcRes.json();
      assert.ok(failNfcData.error.message.includes('NFC Card UID must be 4-50'));
      console.log('✓ Rejected check-in without NFC card UID in NFC_CARD mode.');

      // Test 3: Change Token Delivery Mode to EMAIL_QR
      console.log('Test 3: PUT /config/delivery-mode -> EMAIL_QR');
      const putModeRes = await fetch(`${BASE_URL}/config/delivery-mode`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ mode: 'EMAIL_QR' })
      });
      assert.strictEqual(putModeRes.status, 200);
      const putModeData: any = await putModeRes.json();
      assert.strictEqual(putModeData.success, true);
      console.log('✓ Token Delivery Mode updated to EMAIL_QR.');

      // Test 4: Check-in under EMAIL_QR mode without email (should fail)
      console.log('Test 4: Check-in under EMAIL_QR mode without email (should fail)');
      const checkinFailEmailRes = await fetch(`${BASE_URL}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          phoneNumber: '9999999992',
          customerName: 'QR Test Customer',
          personsCount: 2,
          placeTypeId: ptStanding.id,
          tableId: tableS2.id
        })
      });
      assert.strictEqual(checkinFailEmailRes.status, 400);
      const failEmailData: any = await checkinFailEmailRes.json();
      assert.ok(failEmailData.error.message.includes('Email address is mandatory'));
      console.log('✓ Rejected check-in without email in EMAIL_QR mode.');

      // Test 5: Successful check-in under EMAIL_QR mode
      console.log('Test 5: Successful Check-in under EMAIL_QR mode');
      const checkinSuccessRes = await fetch(`${BASE_URL}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          phoneNumber: '9999999993',
          customerName: 'QR Test Customer',
          email: 'qr.customer@gmail.com',
          personsCount: 2,
          placeTypeId: ptStanding.id,
          tableId: tableS2.id
        })
      });
      assert.strictEqual(checkinSuccessRes.status, 201);
      const successData: any = await checkinSuccessRes.json();
      assert.ok(successData.tokenNumber);
      assert.strictEqual(successData.email, 'qr.customer@gmail.com');
      assert.strictEqual(successData.cardUid, null); // no card uid in QR mode
      console.log('✓ Check-in succeeded under EMAIL_QR mode. Token Number:', successData.tokenNumber);

      const tokenNumber = successData.tokenNumber;
      const tokenId = successData.id;

      // Verify deliveryMode and emailDeliveryStatus in DB
      const dbToken = await prisma.token.findUnique({ where: { id: tokenId } });
      assert.strictEqual(dbToken?.deliveryMode, 'EMAIL_QR');
      assert.strictEqual(dbToken?.emailDeliveryStatus, 'PENDING');
      console.log('✓ Database entity deliveryMode and emailDeliveryStatus verified.');

      // Test 6: Generate QR payload
      console.log('Test 6: POST /tokens/:id/generate-qr');
      const genQrRes = await fetch(`${BASE_URL}/tokens/${tokenId}/generate-qr`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      assert.strictEqual(genQrRes.status, 200);
      const genQrData: any = await genQrRes.json();
      assert.strictEqual(genQrData.success, true);
      assert.ok(genQrData.data.qrImage);
      console.log('✓ QR Image URL generated:', genQrData.data.qrImage);

      // Extract the signed token from the image URL to simulate scanning
      const qrUrl = genQrData.data.qrImage;
      const searchParams = new URL(qrUrl).searchParams;
      const signedPayload = searchParams.get('data');
      assert.ok(signedPayload);

      // Test 7: Verify QR Code signature via /qr/verify
      console.log('Test 7: POST /qr/verify (Valid signature)');
      const verifyRes = await fetch(`${BASE_URL}/qr/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ token: signedPayload })
      });
      assert.strictEqual(verifyRes.status, 200);
      const verifyData: any = await verifyRes.json();
      assert.strictEqual(verifyData.success, true);
      assert.strictEqual(verifyData.data.valid, true);
      assert.strictEqual(verifyData.data.tokenNumber, tokenNumber);
      console.log('✓ Valid QR signature correctly verified.');

      // Test 8: Verify QR Code signature (Invalid/Forged signature)
      console.log('Test 8: POST /qr/verify (Invalid signature)');
      const verifyInvalidRes = await fetch(`${BASE_URL}/qr/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({ token: signedPayload + 'forged' })
      });
      assert.strictEqual(verifyInvalidRes.status, 400);
      const verifyInvalidData: any = await verifyInvalidRes.json();
      assert.strictEqual(verifyInvalidData.success, false);
      assert.strictEqual(verifyInvalidData.error.code, 'QR_INVALID_SIGNATURE');
      console.log('✓ Rejected forged QR code payload.');

      // Test 9: Redeem QR token via unified /redemptions endpoint
      console.log('Test 9: POST /redemptions (Valid QR_SCAN)');
      const redeemRes = await fetch(`${BASE_URL}/redemptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          payload: signedPayload,
          presentationType: 'QR_SCAN',
          bartenderId: bartenderUser()?.id || adminUser.id
        })
      });
      assert.strictEqual(redeemRes.status, 200);
      const redeemData: any = await redeemRes.json();
      assert.strictEqual(redeemData.success, true);
      assert.strictEqual(redeemData.data.remainingRedemptions, 3); // 2 persons * 2 drinks = 4. 4 - 1 = 3 remaining.
      console.log('✓ Redemption recorded successfully via QR scan.');

      // Test 10: Try to redeem EMAIL_QR token using NFC_TAP presentation type (should fail)
      console.log('Test 10: Block redemption of EMAIL_QR token via NFC_TAP presentation type');
      const redeemTapRes = await fetch(`${BASE_URL}/redemptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          payload: tokenNumber,
          presentationType: 'NFC_TAP',
          bartenderId: adminUser.id
        })
      });
      assert.strictEqual(redeemTapRes.status, 400);
      const redeemTapData: any = await redeemTapRes.json();
      assert.ok(redeemTapData.error.message.includes('Email QR token cannot be redeemed via NFC tap'));
      console.log('✓ Blocked crossing presentation modes (EMAIL_QR token via NFC_TAP).');

      // Test 11: Switch back to NFC_CARD, check in a new token, and verify crossing modes are blocked in that direction
      console.log('Test 11: Toggle back to NFC_CARD mode, create token, and verify QR redemption is blocked');
      // Set to NFC_CARD
      await fetch(`${BASE_URL}/config/delivery-mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
        body: JSON.stringify({ mode: 'NFC_CARD' })
      });

      // Check-in NFC
      const checkinNfcSuccessRes = await fetch(`${BASE_URL}/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          phoneNumber: '9999999994',
          customerName: 'NFC Success Customer',
          personsCount: 1,
          placeTypeId: ptStanding.id,
          tableId: tableS3.id,
          nfcCardUid: 'CARD-003'
        })
      });
      assert.strictEqual(checkinNfcSuccessRes.status, 201);
      const nfcSuccessData: any = await checkinNfcSuccessRes.json();
      const nfcTokenNumber = nfcSuccessData.tokenNumber;

      // Try to redeem this NFC token via QR_SCAN presentation type (should fail)
      // First generate a signed QR for it using jwt (simulate forged scan or trying to scan its raw string)
      const fakeSignedNfcPayload = jwt.sign({ token: nfcTokenNumber, type: 'EMAIL_QR' }, process.env.GLOBAL_SIGNING_KEY || 'default-global-secret');
      const redeemNfcQrRes = await fetch(`${BASE_URL}/redemptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          payload: fakeSignedNfcPayload,
          presentationType: 'QR_SCAN',
          bartenderId: adminUser.id
        })
      });
      assert.strictEqual(redeemNfcQrRes.status, 400);
      const redeemNfcQrData: any = await redeemNfcQrRes.json();
      assert.ok(redeemNfcQrData.error.message.includes('NFC token cannot be redeemed via QR scan'));
      console.log('✓ Blocked crossing presentation modes (NFC token via QR_SCAN).');

      // Test 12: Verify resend email endpoint works
      console.log('Test 12: POST /tokens/:id/resend-email');
      const resendRes = await fetch(`${BASE_URL}/tokens/${tokenId}/resend-email`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      assert.strictEqual(resendRes.status, 200);
      const resendData: any = await resendRes.json();
      assert.strictEqual(resendData.success, true);
      assert.strictEqual(resendData.data.emailStatus, 'PENDING');
      console.log('✓ Resend email job enqueued successfully.');

      // Test 13: POST /check-in/pending
      console.log('Test 13: POST /check-in/pending');
      const pendingRes = await fetch(`${BASE_URL}/check-in/pending`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          phoneNumber: '9876543210',
          customerName: 'Pending Guest',
          email: 'pending.guest@gmail.com',
          personsCount: 2,
          placeType: 'STANDING_BAR'
        })
      });
      assert.strictEqual(pendingRes.status, 201);
      const pendingData: any = await pendingRes.json();
      assert.ok(pendingData.tokenNumber);
      assert.strictEqual(pendingData.customerName, 'Pending Guest');
      assert.strictEqual(pendingData.paymentVerified, false);
      const pendingTokenNumber = pendingData.tokenNumber;
      console.log('✓ Pending session check-in created successfully. Token:', pendingTokenNumber);

      // Test 14: GET /check-in/verify-qr/:tokenNumber
      console.log('Test 14: GET /check-in/verify-qr/:tokenNumber');
      const verifyQrRes = await fetch(`${BASE_URL}/check-in/verify-qr/${pendingTokenNumber}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      assert.strictEqual(verifyQrRes.status, 200);
      const verifyQrData: any = await verifyQrRes.json();
      assert.strictEqual(verifyQrData.tokenNumber, pendingTokenNumber);
      assert.strictEqual(verifyQrData.paymentVerified, false);
      console.log('✓ Pending QR session token successfully verified.');

      // Test 14.1: Attempt to redeem drink for pending unpaid QR (should fail)
      console.log('Test 14.1: Block drink redemption on pending unpaid QR');
      // Generate a signed payload for the pending token
      const pendingGenRes = await fetch(`${BASE_URL}/tokens/${pendingData.id}/generate-qr`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      assert.strictEqual(pendingGenRes.status, 200);
      const pendingGenData: any = await pendingGenRes.json();
      const pendingSignedPayload = new URL(pendingGenData.data.qrImage).searchParams.get('data');

      const failedRedeemRes = await fetch(`${BASE_URL}/redemptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          payload: pendingSignedPayload,
          presentationType: 'QR_SCAN',
          bartenderId: adminUser.id
        })
      });
      assert.strictEqual(failedRedeemRes.status, 400);
      const failedRedeemData: any = await failedRedeemRes.json();
      assert.strictEqual(failedRedeemData.success, false);
      assert.strictEqual(failedRedeemData.error.message, 'Payment has not been verified for this session.');
      console.log('✓ Correctly blocked drink redemption on unpaid QR session.');

      // Test 14.2: Attempt to checkout/close unpaid pending session (should fail)
      console.log('Test 14.2: Block checkout on pending unpaid session');
      const failedCloseRes = await fetch(`${BASE_URL}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          tokenNumber: pendingTokenNumber,
          eraseCard: false
        })
      });
      assert.strictEqual(failedCloseRes.status, 400);
      const failedCloseData: any = await failedCloseRes.json();
      assert.strictEqual(failedCloseData.error, 'Cannot close an unpaid pending QR session.');
      console.log('✓ Correctly blocked checkout on unpaid pending session.');

      // Test 15: POST /check-in/activate
      console.log('Test 15: POST /check-in/activate');
      // Find an available table first
      const availableTable = await prisma.table.findFirst({
        where: { status: 'available', placeType: { name: 'STANDING_BAR' } }
      });
      assert.ok(availableTable);
      const activateRes = await fetch(`${BASE_URL}/check-in/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify({
          tokenNumber: pendingTokenNumber,
          tableNumber: availableTable.tableNumber,
          amountPaid: 1000
        })
      });
      assert.strictEqual(activateRes.status, 200);
      const activateData: any = await activateRes.json();
      assert.strictEqual(activateData.tokenNumber, pendingTokenNumber);
      assert.strictEqual(activateData.paymentVerified, true);
      assert.strictEqual(Number(activateData.amountPaid), 1000);
      assert.strictEqual(activateData.tableNumber, availableTable.tableNumber);

      // Verify that the table status in DB is occupied
      const tableInDb = await prisma.table.findUnique({
        where: { id: availableTable.id }
      });
      assert.strictEqual(tableInDb?.status, 'occupied');
      console.log('✓ Pending session activated successfully.');

      console.log('\n=========================================');
      console.log('ALL EMAIL QR INTEGRATION TESTS PASSED!');
      console.log('=========================================\n');

      server.close();
      process.exit(0);

    } catch (e: any) {
      console.error('Test Failed:', e.message);
      console.error(e.stack);
      server.close();
      process.exit(1);
    }
  });
}

function bartenderUser(): any {
  return null;
}

runTests();
