process.env.NODE_ENV = 'test';
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
import assert from 'assert';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import router from '../src/routes';
import { redisService } from '../src/services/RedisService';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/api', router);

const PORT = 4009;
const BASE_URL = `http://localhost:${PORT}/api`;

let dbPlaceTypes: Record<string, string> = {};

async function cleanupDb() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('_test') && !dbUrl.includes('test_db')) {
    console.error('\n❌ ERROR: Destructive database operation blocked. Test suite is configured to run against the main development database. Please set DATABASE_URL_TEST to a dedicated test database (e.g. nfc_bar_test_db) and run again.');
    process.exit(1);
  }
  console.log('Cleaning up database for Duplicate Check-In validation tests...');
  await prisma.syncLog.deleteMany({});
  await prisma.redemption.deleteMany({});
  await prisma.tokenExtension.deleteMany({});
  await prisma.tableOccupancyLog.deleteMany({});
  await prisma.token.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.roleChangeLog.deleteMany({});
  await prisma.rateLog.deleteMany({});
  await prisma.table.deleteMany({});
  await prisma.placeTypeConfig.deleteMany({});

  // Seed configs
  const pt = await prisma.placeTypeConfig.create({
    data: {
      name: 'STANDING_BAR',
      ratePerPerson: 500.0,
      baseTimeMinutes: 120,
      redemptionsPerPerson: 2,
      isActive: true,
    }
  });
  dbPlaceTypes['STANDING_BAR'] = pt.id;

  const tableObj = await prisma.table.create({
    data: {
      tableNumber: 'S-95',
      placeTypeId: pt.id,
      capacity: 4,
      status: 'available',
      isActive: true,
    }
  });

  console.log('Cleaned up database.');
}

async function runTests() {
  const server = app.listen(PORT, async () => {
    console.log(`Duplicate Validation Test server running on port ${PORT}`);

    try {
      await cleanupDb();

      // Get Auth Token
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

      const headers = {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      };

      const tableObj = await prisma.table.findFirst({ where: { tableNumber: 'S-95' } });
      assert.ok(tableObj);

      console.log('\n--- STARTING DUPLICATE VALIDATION TEST CASES ---\n');

      // Test 1: Validate Unique Check-In - New email + new phone -> ALLOWED
      console.log('Test 1: Check new unique phone/email validation');
      const valRes1 = await fetch(`${BASE_URL}/check-in/validate-duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: '9876543210',
          email: 'test1@gmail.com'
        })
      });
      const valData1: any = await valRes1.json();
      assert.strictEqual(valRes1.status, 200);
      assert.strictEqual(valData1.conflicts.email, false);
      assert.strictEqual(valData1.conflicts.phone, false);
      console.log('✓ Unique check-in values validation passed.');

      // Create a pending check-in (token 1)
      console.log('Creating first pending check-in...');
      const checkIn1 = await fetch(`${BASE_URL}/check-in/pending`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: '9876543210',
          customerName: 'John Doe',
          email: 'test1@gmail.com',
          personsCount: 2,
          placeType: 'STANDING_BAR',
          placeTypeId: dbPlaceTypes['STANDING_BAR'],
          tableId: tableObj.id,
          tableNumber: 'S-95'
        })
      });
      const checkInData1: any = await checkIn1.json();
      assert.strictEqual(checkIn1.status, 201);
      const tokenNumber1 = checkInData1.tokenNumber;
      console.log(`✓ Created pending token: ${tokenNumber1}`);

      // Test 2: Duplicate validation checks when PENDING_PAYMENT exists
      console.log('Test 2: Check duplicate validation for existing active email/phone (PENDING_PAYMENT)');
      const valRes2 = await fetch(`${BASE_URL}/check-in/validate-duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: '9876543210',
          email: 'test1@gmail.com'
        })
      });
      const valData2: any = await valRes2.json();
      assert.strictEqual(valData2.conflicts.email, true);
      assert.strictEqual(valData2.conflicts.phone, true);
      console.log('✓ Validation correctly flagged email and phone conflicts.');

      // Test 3: Validate duplicate check-in with tokenNumber exclusion works
      console.log('Test 3: Validate exclusion using tokenNumber');
      const valRes3 = await fetch(`${BASE_URL}/check-in/validate-duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: '9876543210',
          email: 'test1@gmail.com',
          tokenNumber: tokenNumber1
        })
      });
      const valData3: any = await valRes3.json();
      assert.strictEqual(valData3.conflicts.email, false);
      assert.strictEqual(valData3.conflicts.phone, false);
      console.log('✓ Validation correctly allowed original token exclusion.');

      // Test 4: Final backend validation fails if duplicate pending session creation is attempted
      console.log('Test 4: Backend authoritative validation rejects duplicate check-in creation');
      const checkIn2 = await fetch(`${BASE_URL}/check-in/pending`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: '9876543210',
          customerName: 'Another Name',
          email: 'test2@gmail.com', // different email, duplicate phone
          personsCount: 2,
          placeType: 'STANDING_BAR',
          placeTypeId: dbPlaceTypes['STANDING_BAR'],
          tableId: tableObj.id,
          tableNumber: 'S-95'
        })
      });
      const checkInData2: any = await checkIn2.json();
      assert.strictEqual(checkIn2.status, 400);
      assert.strictEqual(checkInData2.error.code, 'DUPLICATE_ACTIVE_SESSION');
      console.log('✓ Backend successfully rejected duplicate creation with code DUPLICATE_ACTIVE_SESSION.');

      // Activate first token to status ACTIVE
      console.log('Activating first pending token to ACTIVE status...');
      const activateRes = await fetch(`${BASE_URL}/check-in/activate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tokenNumber: tokenNumber1,
          tableNumber: 'S-95',
          amountPaid: 1000
        })
      });
      assert.strictEqual(activateRes.status, 200);

      // Verify status is ACTIVE
      const activeToken = await prisma.token.findUnique({
        where: { tokenNumber: tokenNumber1 }
      });
      assert.strictEqual(activeToken?.status, 'ACTIVE');
      console.log('✓ Activated token successfully.');

      // Test 5: Check duplicate validation when status is ACTIVE
      console.log('Test 5: Check duplicate validation when session is ACTIVE');
      const valRes4 = await fetch(`${BASE_URL}/check-in/validate-duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: '9876543210',
          email: 'test1@gmail.com'
        })
      });
      const valData4: any = await valRes4.json();
      assert.strictEqual(valData4.conflicts.email, true);
      assert.strictEqual(valData4.conflicts.phone, true);
      console.log('✓ Validation correctly flagged email and phone conflicts under ACTIVE state.');

      // Test 6: Validate casing and spacing variations
      console.log('Test 6: Check casing and spacing variation normalization');
      const valRes5 = await fetch(`${BASE_URL}/check-in/validate-duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: ' +91 98765 43210  ',
          email: '  TEST1@GMAIL.COM  '
        })
      });
      const valData5: any = await valRes5.json();
      assert.strictEqual(valData5.conflicts.email, true, 'Casing/spacing email validation failed');
      assert.strictEqual(valData5.conflicts.phone, true, 'Formatting phone validation failed');
      console.log('✓ Variations successfully normalized and flagged.');

      // Test 7: Closed/expired/cancelled sessions release email and phone
      console.log('Test 7: Verification of CLOSED, EXPIRED, CANCELLED release');
      
      // Close token 1
      console.log('Closing session with force to release table...');
      const closeRes = await fetch(`${BASE_URL}/sessions/${tokenNumber1}/close`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          force: true
        })
      });
      assert.strictEqual(closeRes.status, 200);

      // Verify duplicate validation is now clean
      const valRes6 = await fetch(`${BASE_URL}/check-in/validate-duplicate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phoneNumber: '9876543210',
          email: 'test1@gmail.com'
        })
      });
      const valData6: any = await valRes6.json();
      assert.strictEqual(valData6.conflicts.email, false);
      assert.strictEqual(valData6.conflicts.phone, false);
      console.log('✓ CLOSED session successfully released email and phone.');

      // Test 8: Concurrency Protection (two simultaneous requests with same email)
      console.log('Test 8: Concurrent creations with same email');
      const results = await Promise.all([
        fetch(`${BASE_URL}/check-in/pending`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phoneNumber: '9999999901',
            customerName: 'Client A',
            email: 'concur@gmail.com',
            personsCount: 1,
            placeType: 'STANDING_BAR',
            placeTypeId: dbPlaceTypes['STANDING_BAR'],
            tableId: tableObj.id,
            tableNumber: 'S-95'
          })
        }),
        fetch(`${BASE_URL}/check-in/pending`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            phoneNumber: '9999999902',
            customerName: 'Client B',
            email: 'concur@gmail.com',
            personsCount: 1,
            placeType: 'STANDING_BAR',
            placeTypeId: dbPlaceTypes['STANDING_BAR'],
            tableId: tableObj.id,
            tableNumber: 'S-95'
          })
        })
      ]);

      const successCount = results.filter(r => r.status === 201).length;
      const failCount = results.filter(r => r.status === 400).length;
      
      assert.strictEqual(successCount, 1, 'Exactly one concurrent request must succeed');
      assert.strictEqual(failCount, 1, 'Exactly one concurrent request must fail');
      
      const failedResult = results.find(r => r.status === 400);
      const failedData: any = await failedResult?.json();
      assert.strictEqual(failedData.error.code, 'DUPLICATE_ACTIVE_SESSION');
      console.log('✓ Concurrent locking successfully blocked one request and processed the other.');

      console.log('\n=========================================');
      console.log('ALL DUPLICATE VALIDATION TESTS PASSED!');
      console.log('=========================================\n');

      server.close();
      await redisService.disconnect();
      process.exit(0);
    } catch (e) {
      console.error('❌ Test failed with error:', e);
      server.close();
      await redisService.disconnect();
      process.exit(1);
    }
  });
}

runTests();
