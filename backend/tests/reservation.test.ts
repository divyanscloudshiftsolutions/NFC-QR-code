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

const PORT = 4007;
const BASE_URL = `http://localhost:${PORT}/api`;

let dbPlaceTypes: Record<string, string> = {};

async function cleanupDb() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('_test') && !dbUrl.includes('test_db') && !dbUrl.includes('localhost') && process.env.NODE_ENV === 'test') {
    console.warn('\n⚠️ WARNING: Attempted destructive database operation against a non-test database URL!');
    process.exit(1);
  }
  console.log('Cleaning up database for Reservation tests...');
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

  // Seed standing bar place type
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

  // Create tables for test
  await prisma.table.create({
    data: {
      tableNumber: 'S-90',
      placeTypeId: pt.id,
      capacity: 4,
      status: 'available',
      isActive: true,
    }
  });
  await prisma.table.create({
    data: {
      tableNumber: 'S-91',
      placeTypeId: pt.id,
      capacity: 2,
      status: 'available',
      isActive: true,
    }
  });

  console.log('Cleaned up database.');
}

async function runTests() {
  const server = app.listen(PORT, async () => {
    console.log(`Reservation Test server running on port ${PORT}`);

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

      const tableS90 = await prisma.table.findFirst({ where: { tableNumber: 'S-90' } });
      const tableS91 = await prisma.table.findFirst({ where: { tableNumber: 'S-91' } });
      assert.ok(tableS90, 'Table S-90 is missing');
      assert.ok(tableS91, 'Table S-91 is missing');

      // Test 1: Lock an available table
      console.log('Test 1: Lock table S-90 (status: available)');
      const lockRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/lock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        }
      });
      const lockData: any = await lockRes.json();
      assert.strictEqual(lockRes.status, 200);
      assert.strictEqual(lockData.success, true);
      assert.strictEqual(lockData.table.status, 'in_checkin');

      // Verify Redis entry is created
      const lockKey = `table:lock:${tableS90.id}`;
      const lockMeta = await redisService.get(lockKey);
      assert.ok(lockMeta, 'Redis lock metadata should exist');
      const meta = JSON.parse(lockMeta);
      assert.strictEqual(meta.originalStatus, 'available');
      console.log('✓ Table successfully locked and metadata saved to Redis.');

      // Test 2: Try to lock an already locked table (concurrency prevention)
      console.log('Test 2: Try to lock already locked table S-90 (should fail)');
      const relockRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/lock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        }
      });
      const relockData: any = await relockRes.json();
      assert.strictEqual(relockRes.status, 400);
      assert.strictEqual(relockData.success, false);
      assert.ok(relockData.error.message.includes('cannot be locked'));
      console.log('✓ Relocking blocked successfully.');

      // Test 3: Try to manually change the status of an in_checkin table (status protection)
      console.log('Test 3: Try to patch status of S-90 to maintenance (should fail)');
      const patchRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'maintenance' })
      });
      const patchData: any = await patchRes.json();
      assert.strictEqual(patchRes.status, 400);
      assert.strictEqual(patchData.success, false);
      assert.ok(patchData.error.message.includes('locked for check-in'));
      console.log('✓ Manual status changes on locked tables blocked successfully.');

      // Test 4: Unlock the table (should revert back to available)
      console.log('Test 4: Unlock table S-90');
      const unlockRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/unlock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        }
      });
      const unlockData: any = await unlockRes.json();
      assert.strictEqual(unlockRes.status, 200);
      assert.strictEqual(unlockData.success, true);
      assert.strictEqual(unlockData.table.status, 'available');

      // Verify Redis entry is cleaned up
      const lockMetaPostUnlock = await redisService.get(lockKey);
      assert.strictEqual(lockMetaPostUnlock, null, 'Redis lock metadata should be deleted');
      console.log('✓ Table unlocked and restored to available successfully.');

      // Test 5: Reserve table S-90
      console.log('Test 5: Reserve table S-90');
      const reserveRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'reserved' })
      });
      const reserveData: any = await reserveRes.json();
      assert.strictEqual(reserveRes.status, 200);
      assert.strictEqual(reserveData.status, 'reserved');
      console.log('✓ Table reserved successfully.');

      // Test 6: Lock a reserved table (for check-in)
      console.log('Test 6: Lock reserved table S-90');
      const lockReservedRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/lock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        }
      });
      const lockReservedData: any = await lockReservedRes.json();
      assert.strictEqual(lockReservedRes.status, 200);
      assert.strictEqual(lockReservedData.table.status, 'in_checkin');

      // Verify lock metadata remembers original status was 'reserved'
      const lockMetaReserved = await redisService.get(lockKey);
      assert.ok(lockMetaReserved);
      const metaReserved = JSON.parse(lockMetaReserved);
      assert.strictEqual(metaReserved.originalStatus, 'reserved');
      console.log('✓ Locked reserved table successfully. Redis metadata correctly holds originalStatus: reserved.');

      // Test 7: Unlock table (should revert back to reserved, not available)
      console.log('Test 7: Unlock table S-90 (should revert back to reserved)');
      const unlockReservedRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/unlock`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        }
      });
      const unlockReservedData: any = await unlockReservedRes.json();
      assert.strictEqual(unlockReservedRes.status, 200);
      assert.strictEqual(unlockReservedData.table.status, 'reserved');
      console.log('✓ Unlocked table successfully restored to originalStatus: reserved.');

      // Test 8: Trying to cancel reservation when table is locked (should fail)
      console.log('Test 8: Try to cancel reservation of table while it is locked for check-in (should fail)');
      // First lock it again
      await fetch(`${BASE_URL}/tables/${tableS90.id}/lock`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      // Try to cancel reservation via PATCH status available
      const cancelRes = await fetch(`${BASE_URL}/tables/${tableS90.id}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'available' })
      });
      const cancelData: any = await cancelRes.json();
      assert.strictEqual(cancelRes.status, 400);
      assert.strictEqual(cancelData.success, false);
      console.log('✓ Cancellation of reservation blocked successfully when table is in check-in.');

      // Cleanup: Unlock table S-90 back to reserved
      await fetch(`${BASE_URL}/tables/${tableS90.id}/unlock`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });

      console.log('\n=========================================');
      console.log('ALL RESERVATION WORKFLOW TESTS PASSED!');
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
