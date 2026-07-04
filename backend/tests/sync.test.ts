process.env.NODE_ENV = 'test';
import assert from 'assert';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import router from '../src/routes';
import redisService from '../src/services/RedisService';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/api', router);

const PORT = 4005;
const BASE_URL = `http://localhost:${PORT}/api`;

let testCounter = 0;
function generateTestCustomer(prefix: string) {
  testCounter++;
  const charSuffix = (Date.now() + testCounter).toString(36).replace(/[0-9]/g, (d) => String.fromCharCode(97 + parseInt(d)));
  return {
    name: `${prefix} ${charSuffix}`.replace(/[^a-zA-Z\s.'-]/g, ''),
    phone: `90000${String(testCounter).padStart(5, '0')}`,
    email: `test${charSuffix}@gmail.com`
  };
}

async function cleanupDb() {
  console.log('Cleaning up database for tests...');
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
  
  // Reset configurations to default
  await prisma.systemConfig.upsert({
    where: { configKey: 'nfc_card_enabled' },
    update: { configValue: 'true' },
    create: { configKey: 'nfc_card_enabled', configValue: 'true' }
  });
  await prisma.systemConfig.upsert({
    where: { configKey: 'email_qr_enabled' },
    update: { configValue: 'true' },
    create: { configKey: 'email_qr_enabled', configValue: 'true' }
  });
  await redisService.setex('config:nfc_card_enabled', 86400, 'true');
  await redisService.setex('config:email_qr_enabled', 86400, 'true');

  await prisma.user.deleteMany({
    where: {
      username: {
        notIn: ['admin', 'receptionist', 'bartender', 'manager']
      }
    }
  });
  
  // Reset all cards to available
  await prisma.card.updateMany({
    data: { status: 'available' }
  });

  // Re-seed place types
  const placeTypeSpecs = [
    {
      name: 'STANDING_BAR',
      ratePerPerson: 500.0,
      baseTimeMinutes: 120,
      redemptionsPerPerson: 2,
      isActive: true,
    },
    {
      name: 'PREMIUM_LOUNGE',
      ratePerPerson: 1200.0,
      baseTimeMinutes: 180,
      redemptionsPerPerson: 3,
      isActive: true,
    },
  ];

  const dbPlaceTypes: Record<string, string> = {};
  for (const pt of placeTypeSpecs) {
    const createdPt = await prisma.placeTypeConfig.create({
      data: pt
    });
    dbPlaceTypes[pt.name] = createdPt.id;
  }

  // Re-seed tables
  // Standard tables S-01 to S-15
  for (let i = 1; i <= 15; i++) {
    const tableNumber = `S-${String(i).padStart(2, '0')}`;
    await prisma.table.create({
      data: {
        tableNumber,
        placeTypeId: dbPlaceTypes['STANDING_BAR'],
        capacity: 2,
        status: 'available',
        isActive: true,
      }
    });
  }

  // Premium tables L-01 to L-10
  for (let i = 1; i <= 10; i++) {
    const tableNumber = `L-${String(i).padStart(2, '0')}`;
    await prisma.table.create({
      data: {
        tableNumber,
        placeTypeId: dbPlaceTypes['PREMIUM_LOUNGE'],
        capacity: 6,
        status: 'available',
        isActive: true,
      }
    });
  }

  console.log('Cleaned up database.');
}

async function runTests() {
  // Start server
  const server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}`);

    try {
      await cleanupDb();

      // 1. Get Authentication Token
      console.log('Logging in to get JWT token...');
      const loginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
      });
      const loginData: any = await loginRes.json();
      assert.strictEqual(loginRes.status, 200, 'Login failed');
      const token = loginData.token || loginData.accessToken;
      assert.ok(token, 'JWT token is missing');
      console.log('✓ Login successful. Token obtained.');

      // Get seeded static IDs
      const ptStanding = await prisma.placeTypeConfig.findFirst({ where: { name: 'STANDING_BAR' } });
      const tableS1 = await prisma.table.findFirst({ where: { tableNumber: 'S-01', placeTypeId: ptStanding!.id } });
      const card1 = await prisma.card.findFirst({ where: { nfcUid: 'CARD-001' } });
      const card2 = await prisma.card.findFirst({ where: { nfcUid: 'CARD-002' } });

      assert.ok(ptStanding, 'STANDING_BAR place type is missing');
      assert.ok(tableS1, 'Table S-01 is missing');
      assert.ok(card1, 'Card CARD-001 is missing');
      assert.ok(card2, 'Card CARD-002 is missing');

      const adminUser = await prisma.user.findFirst({ where: { username: 'admin' } });
      const bartenderUser = await prisma.user.findFirst({ where: { username: 'bartender' } });

      // 2. Test Check-in Success
      console.log('Test Case 2: Successful Check-in operation...');
      const customer1 = generateTestCustomer('cust-alice');
      const op1Id = '11111111-1111-4111-a111-111111111111';
      const syncRes1 = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: 'TEST-DEVICE-01',
          operations: [
            {
              operationId: op1Id,
              operationType: 'CHECK_IN',
              timestamp: new Date().toISOString(),
              payload: {
                phoneNumber: customer1.phone,
                customerName: customer1.name,
                email: customer1.email,
                personsCount: 2,
                placeTypeId: ptStanding!.id,
                tableId: tableS1!.id,
                amountPaid: 1000,
                paymentVerified: true,
                issuedBy: adminUser!.id,
                nfcCardUid: card1!.nfcUid
              }
            }
          ]
        })
      });

      const syncData1: any = await syncRes1.json();
      assert.strictEqual(syncRes1.status, 200, 'Sync request failed');
      if (syncData1.processedCount !== 1) {
        console.error('DIAGNOSTIC - SYNC DATA 1:', JSON.stringify(syncData1, null, 2));
      }
      assert.strictEqual(syncData1.processedCount, 1, 'Operation not processed');
      assert.strictEqual(syncData1.results[0].status, 'SUCCESS', 'Check-in failed');
      console.log('✓ Check-in succeeded.');

      // Check DB values
      const dbToken1 = await prisma.token.findFirst({
        where: { customer: { phoneNumber: `+91${customer1.phone}` } }
      });
      assert.ok(dbToken1, 'Token not created in database');
      assert.strictEqual(dbToken1.status, 'ACTIVE', 'Token status should be ACTIVE');
      console.log('✓ Token successfully verified in database.');

      // 2.5 Test Table Seating Occupancy Endpoint
      console.log('Test Case 2.5: Verifying Table Seating Occupancy endpoint data...');
      const occupancyRes = await fetch(`${BASE_URL}/tables/occupancy`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const occupancyData: any = await occupancyRes.json();
      assert.strictEqual(occupancyRes.status, 200, 'Occupancy fetch failed');
      assert.strictEqual(occupancyData.success, true, 'Occupancy response failed');
      
      const standingTables = occupancyData.data.byPlaceType.STANDING_BAR.tables;
      const s01Table = standingTables.find((t: any) => t.tableNumber === 'S-01');
      assert.ok(s01Table, 'Table S-01 occupancy details are missing');
      assert.strictEqual(s01Table.status, 'occupied', 'Table S-01 should be occupied');
      assert.ok(s01Table.currentToken, 'Table S-01 current token details are missing');
      assert.strictEqual(s01Table.currentToken.customerName, customer1.name, 'Customer name mismatch');
      assert.strictEqual(s01Table.currentToken.personsCount, 2, 'Persons count mismatch');
      assert.strictEqual(s01Table.currentToken.redemptionsUsed, 0, 'Redemptions used should be 0');
      assert.strictEqual(s01Table.currentToken.totalRedemptionsAllowed, 4, 'Total redemptions limit mismatch (2 persons * 2 allowed)');
      assert.strictEqual(s01Table.currentToken.remainingDrinks, 4, 'Remaining drinks mismatch');
      assert.ok(s01Table.currentToken.sessionStartTime, 'sessionStartTime is missing');
      assert.ok(s01Table.currentToken.sessionEndTime, 'sessionEndTime is missing');
      console.log('✓ Seating occupancy details successfully verified via API.');

      // 2.7 Test Table Management Block Rules when table is occupied
      console.log('Test Case 2.7: Verifying table management restrictions on occupied table S-01...');
      const editOccupiedRes = await fetch(`${BASE_URL}/tables/${tableS1!.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ capacity: 5 })
      });
      const editOccupiedData: any = await editOccupiedRes.json();
      assert.strictEqual(editOccupiedRes.status, 400, 'Editing occupied table should return 400');
      assert.strictEqual(editOccupiedData.error.code, 'CONFLICT_OCCUPIED', 'Error code mismatch');

      const patchMaintOccupiedRes = await fetch(`${BASE_URL}/tables/${tableS1!.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });
      const patchMaintOccupiedData: any = await patchMaintOccupiedRes.json();
      assert.strictEqual(patchMaintOccupiedRes.status, 400);
      assert.strictEqual(patchMaintOccupiedData.error.code, 'CONFLICT_ACTIVE_SESSION');

      const patchReservedOccupiedRes = await fetch(`${BASE_URL}/tables/${tableS1!.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'reserved' })
      });
      const patchReservedOccupiedData: any = await patchReservedOccupiedRes.json();
      assert.strictEqual(patchReservedOccupiedRes.status, 400);
      assert.strictEqual(patchReservedOccupiedData.error.code, 'CONFLICT_ACTIVE_SESSION');
      console.log('✓ Table management block rules on occupied table successfully verified.');

      // 3. Test Idempotency (Repeat exact same operation)
      console.log('Test Case 3: Idempotent replay of same check-in...');
      const syncRes2 = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: 'TEST-DEVICE-01',
          operations: [
            {
              operationId: op1Id,
              operationType: 'CHECK_IN',
              timestamp: new Date().toISOString(),
              payload: {
                phoneNumber: customer1.phone,
                customerName: customer1.name,
                email: customer1.email,
                personsCount: 2,
                placeTypeId: ptStanding!.id,
                tableId: tableS1!.id,
                amountPaid: 1000,
                paymentVerified: true,
                issuedBy: adminUser!.id,
                nfcCardUid: card1!.nfcUid
              }
            }
          ]
        })
      });
      const syncData2: any = await syncRes2.json();
      assert.strictEqual(syncRes2.status, 200);
      assert.strictEqual(syncData2.processedCount, 1, 'Replayed operation should count as processed');
      assert.strictEqual(syncData2.results[0].status, 'SUCCESS', 'Idempotent replay should return SUCCESS');
      console.log('✓ Idempotency bypass works perfectly.');

      // 4. Test Table Occupancy Conflict
      console.log('Test Case 4: Table conflict handling...');
      const customer2 = generateTestCustomer('cust-bob');
      const op2Id = '22222222-2222-4222-a222-222222222222';
      const syncRes3 = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: 'TEST-DEVICE-01',
          operations: [
            {
              operationId: op2Id,
              operationType: 'CHECK_IN',
              timestamp: new Date().toISOString(),
              payload: {
                phoneNumber: customer2.phone,
                customerName: customer2.name,
                email: customer2.email,
                personsCount: 2,
                placeTypeId: ptStanding!.id,
                tableId: tableS1!.id, // Occupied S-01 table
                amountPaid: 1000,
                paymentVerified: true,
                issuedBy: adminUser!.id,
                nfcCardUid: card2!.nfcUid
              }
            }
          ]
        })
      });
      const syncData3: any = await syncRes3.json();
      assert.strictEqual(syncRes3.status, 200);
      assert.strictEqual(syncData3.processedCount, 0, 'Conflict check-in should not be successfully processed');
      assert.strictEqual(syncData3.results[0].status, 'CONFLICT', 'Should fail due to occupied table');
      assert.strictEqual(syncData3.results[0].error.code, 'CONFLICT_TABLE_OCCUPIED', 'Error code mismatch');
      console.log('✓ Table occupancy conflict successfully caught.');

      // 5. Test Drink Redemption Limit Checks
      console.log('Test Case 5: Drink redemption limits...');
      // Alice token has limit of 4 drinks (2 redemptions per person * 2 personsCount)
      const opRedeem1 = '33333333-3333-4333-a333-333333333331';
      const opRedeem2 = '33333333-3333-4333-a333-333333333332';
      const opRedeem3 = '33333333-3333-4333-a333-333333333333';
      const opRedeem4 = '33333333-3333-4333-a333-333333333334';
      const opRedeem5 = '33333333-3333-4333-a333-333333333335';

      const sendRedemption = async (opId: string): Promise<any> => {
        const res = await fetch(`${BASE_URL}/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            deviceId: 'TEST-DEVICE-01',
            operations: [
              {
                operationId: opId,
                operationType: 'DRINK_REDEMPTION',
                timestamp: new Date().toISOString(),
                payload: {
                  tokenNumber: dbToken1!.tokenNumber,
                  bartenderId: bartenderUser!.id
                }
              }
            ]
          })
        });
        return await res.json();
      };

      const resR1 = await sendRedemption(opRedeem1);
      assert.strictEqual(resR1.results[0].status, 'SUCCESS');
      const resR2 = await sendRedemption(opRedeem2);
      assert.strictEqual(resR2.results[0].status, 'SUCCESS');
      const resR3 = await sendRedemption(opRedeem3);
      assert.strictEqual(resR3.results[0].status, 'SUCCESS');
      const resR4 = await sendRedemption(opRedeem4);
      assert.strictEqual(resR4.results[0].status, 'SUCCESS');
      
      // 5th redemption should exceed limit and fail with CONFLICT_LIMIT_EXCEEDED
      const resR5 = await sendRedemption(opRedeem5);
      assert.strictEqual(resR5.results[0].status, 'CONFLICT');
      assert.strictEqual(resR5.results[0].error.code, 'CONFLICT_LIMIT_EXCEEDED');
      console.log('✓ Drink redemption limits correctly enforced (4 check-ins succeeded, 5th rejected).');

      // 6. Test Expiry Validation
      console.log('Test Case 6: Session expiration conflict...');
      const opRedeemExpired = '44444444-4444-4444-a444-444444444444';
      // Create a redemption operation with timestamp set to 4 hours in the future
      const futureTime = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
      const resExpired = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: 'TEST-DEVICE-01',
          operations: [
            {
              operationId: opRedeemExpired,
              operationType: 'DRINK_REDEMPTION',
              timestamp: futureTime,
              payload: {
                tokenNumber: dbToken1!.tokenNumber,
                bartenderId: bartenderUser!.id
              }
            }
          ]
        })
      });
      const dataExpired: any = await resExpired.json();
      assert.strictEqual(dataExpired.results[0].status, 'CONFLICT');
      assert.strictEqual(dataExpired.results[0].error.code, 'CONFLICT_SESSION_EXPIRED');
      console.log('✓ Session expiry checks block offline actions post-expiration.');

      // 7. Test Session Closed Validation
      console.log('Test Case 7: Session closed conflict...');
      // Let's close Alice's session
      const opClose = '55555555-5555-5555-a555-555555555555';
      const resClose = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: 'TEST-DEVICE-01',
          operations: [
            {
              operationId: opClose,
              operationType: 'SESSION_CLOSE',
              timestamp: new Date().toISOString(),
              payload: {
                tokenNumber: dbToken1!.tokenNumber,
                closedBy: adminUser!.id
              }
            }
          ]
        })
      });
      const dataClose: any = await resClose.json();
      assert.strictEqual(dataClose.results[0].status, 'SUCCESS');
      console.log('✓ Session successfully closed.');

      // Attempt drink redemption after close
      const opPostClose = '66666666-6666-6666-a666-666666666666';
      const resPostClose = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: 'TEST-DEVICE-01',
          operations: [
            {
              operationId: opPostClose,
              operationType: 'DRINK_REDEMPTION',
              timestamp: new Date().toISOString(),
              payload: {
                tokenNumber: dbToken1!.tokenNumber,
                bartenderId: bartenderUser!.id
              }
            }
          ]
        })
      });
      const dataPostClose: any = await resPostClose.json();
      assert.strictEqual(dataPostClose.results[0].status, 'CONFLICT');
      assert.strictEqual(dataPostClose.results[0].error.code, 'CONFLICT_SESSION_CLOSED');
      // 7.5 Test Table Management Actions on Free Table S-01
      console.log('Test Case 7.5: Verifying table management status updates and edits on available table S-01...');
      const patchMaintFreeRes = await fetch(`${BASE_URL}/tables/${tableS1!.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });
      const patchMaintFreeData: any = await patchMaintFreeRes.json();
      assert.strictEqual(patchMaintFreeRes.status, 200, 'Setting free table to maintenance should succeed');
      assert.strictEqual(patchMaintFreeData.status, 'maintenance', 'Status mismatch in response');

      // Verify that check-in on a maintenance table is blocked
      const customer3 = generateTestCustomer('cust-maint');
      const opCheckinMaint = '77777777-7777-7777-b777-777777777777';
      const checkinMaintRes = await fetch(`${BASE_URL}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          deviceId: 'TEST-DEVICE-01',
          operations: [
            {
              operationId: opCheckinMaint,
              operationType: 'CHECK_IN',
              timestamp: new Date().toISOString(),
              payload: {
                phoneNumber: customer3.phone,
                customerName: customer3.name,
                email: customer3.email,
                personsCount: 2,
                placeTypeId: ptStanding!.id,
                tableId: tableS1!.id,
                amountPaid: 1000,
                paymentVerified: true,
                issuedBy: adminUser!.id,
                nfcCardUid: card2!.nfcUid
              }
            }
          ]
        })
      });
      const checkinMaintData: any = await checkinMaintRes.json();
      assert.strictEqual(checkinMaintData.results[0].status, 'CONFLICT', 'Check-in on maintenance table should fail');
      assert.strictEqual(checkinMaintData.results[0].error.code, 'CONFLICT_TABLE_OCCUPIED', 'Error code mismatch');

      // Set to reserved
      const patchReservedFreeRes = await fetch(`${BASE_URL}/tables/${tableS1!.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'reserved' })
      });
      const patchReservedFreeData: any = await patchReservedFreeRes.json();
      assert.strictEqual(patchReservedFreeRes.status, 200);
      assert.strictEqual(patchReservedFreeData.status, 'reserved');

      // Edit Table capacity
      const editFreeRes = await fetch(`${BASE_URL}/tables/${tableS1!.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ capacity: 10 })
      });
      const editFreeData: any = await editFreeRes.json();
      assert.strictEqual(editFreeRes.status, 200, 'Editing free table should succeed');
      assert.strictEqual(editFreeData.capacity, 10, 'Capacity was not updated');

      // Revert status back to available
      const patchAvailableFreeRes = await fetch(`${BASE_URL}/tables/${tableS1!.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'available' })
      });
      assert.strictEqual(patchAvailableFreeRes.status, 200);
      console.log('✓ Seating table management actions on free table successfully verified.');

      // 8. Test Audit logs in database
      console.log('Test Case 8: Sync Log audit trail check...');
      const logs = await prisma.syncLog.findMany();
      assert.ok(logs.length >= 8, 'Expected sync logs to be recorded');
      
      const successLogs = logs.filter(l => l.status === 'SUCCESS');
      const conflictLogs = logs.filter(l => l.status === 'CONFLICT');
      assert.ok(successLogs.length > 0, 'No SUCCESS logs found');
      assert.ok(conflictLogs.length > 0, 'No CONFLICT logs found');
      console.log(`✓ Audit log verified: Recorded ${successLogs.length} SUCCESS logs, ${conflictLogs.length} CONFLICT logs.`);

      // 9. Test Staff Management (FR6.5)
      console.log('Test Case 9: Verifying Staff Management endpoints and rules...');

      // 9.1 Test Non-Admin block rules
      console.log('  9.1 Verifying non-admins are blocked from staff management...');
      const bartenderLoginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'bartender', password: 'bar123' })
      });
      const bartenderLoginData: any = await bartenderLoginRes.json();
      const bartenderToken = bartenderLoginData.token || bartenderLoginData.accessToken;
      assert.ok(bartenderToken, 'Bartender login failed');

      const blockUsersRes = await fetch(`${BASE_URL}/users`, {
        headers: { 'Authorization': `Bearer ${bartenderToken}` }
      });
      assert.strictEqual(blockUsersRes.status, 403, 'Non-admin should be forbidden from getting users');

      // 9.2 Test GET /api/users for Admin
      console.log('  9.2 Verifying admin can list users...');
      const usersListRes = await fetch(`${BASE_URL}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const usersListData: any = await usersListRes.json();
      assert.strictEqual(usersListRes.status, 200, 'Listing users failed');
      assert.strictEqual(usersListData.success, true, 'User list request unsuccessful');
      assert.ok(usersListData.data.length >= 4, 'Expected at least the 4 seeded users');

      const adminUserObj = usersListData.data.find((u: any) => u.username === 'admin');
      const receptionistUserObj = usersListData.data.find((u: any) => u.username === 'receptionist');
      assert.ok(adminUserObj, 'Admin user not found in list');
      assert.ok(receptionistUserObj, 'Receptionist user not found in list');

      // 9.3 Test Role-Prefix and Password validations
      console.log('  9.3 Verifying role-prefix and PIN/password validation rules...');
      // 9.3.1 Mismatched role-prefix check
      const invalidPrefixRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: 'BAR-10', // bartender prefix
          password: 'recepPassword123!',
          fullName: 'Mismatched Receptionist',
          roleName: 'receptionist' // receptionist role
        })
      });
      const invalidPrefixData: any = await invalidPrefixRes.json();
      assert.strictEqual(invalidPrefixRes.status, 400, 'Mismatched prefix should return 400');
      assert.strictEqual(invalidPrefixData.error.code, 'VAL_ERR', 'Error code mismatch');

      // 9.3.2 Valid creation with 4-digit PIN
      const createRecepRes = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: 'REC-10',
          password: '9999', // 4-digit PIN
          fullName: 'New Receptionist Ten',
          roleName: 'receptionist'
        })
      });
      const createRecepData: any = await createRecepRes.json();
      assert.strictEqual(createRecepRes.status, 201, 'Creating receptionist with PIN should succeed');
      const newRecepId = createRecepData.user.id;

      // 9.4 Test login with newly registered user PIN
      console.log('  9.4 Verifying new user can log in with their PIN...');
      const newRecepLoginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'REC-10', password: '9999' })
      });
      const newRecepLoginData: any = await newRecepLoginRes.json();
      assert.strictEqual(newRecepLoginRes.status, 200, 'New user login failed');
      const newRecepToken = newRecepLoginData.token || newRecepLoginData.accessToken;
      assert.ok(newRecepToken, 'JWT token is missing for new user login');

      // 9.5 Test prevent self-deactivation
      console.log('  9.5 Verifying prevent self-deactivation rule...');
      // 9.5.1 via PUT /api/users/:id
      const selfDeactivatePutRes = await fetch(`${BASE_URL}/users/${adminUserObj.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: 'admin',
          fullName: 'System Admin Updated',
          roleName: 'admin',
          isActive: false // self deactivation
        })
      });
      const selfDeactivatePutData: any = await selfDeactivatePutRes.json();
      assert.strictEqual(selfDeactivatePutRes.status, 400, 'Self deactivation via PUT should be blocked');
      assert.strictEqual(selfDeactivatePutData.error.code, 'CONFLICT_SELF_DEACTIVATION');

      // 9.5.2 via PATCH /api/users/:id/status
      const selfDeactivatePatchRes = await fetch(`${BASE_URL}/users/${adminUserObj.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: false })
      });
      const selfDeactivatePatchData: any = await selfDeactivatePatchRes.json();
      assert.strictEqual(selfDeactivatePatchRes.status, 400, 'Self deactivation via PATCH should be blocked');
      assert.strictEqual(selfDeactivatePatchData.error.code, 'CONFLICT_SELF_DEACTIVATION');

      // 9.6 Test Role Change Logging
      console.log('  9.6 Verifying role change auditing and logging...');
      const roleChangeRes = await fetch(`${BASE_URL}/users/${newRecepId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: 'BAR-10', // updated username prefix
          fullName: 'New Receptionist Ten',
          roleName: 'bartender', // changed role receptionist -> bartender
          isActive: true
        })
      });
      assert.strictEqual(roleChangeRes.status, 200, 'Updating receptionist to bartender failed');

      // Query database for RoleChangeLog entries
      const roleLogs = await prisma.roleChangeLog.findMany({
        where: { targetUserId: newRecepId }
      });
      assert.strictEqual(roleLogs.length, 1, 'Expected exactly 1 role change log entry to be written');
      assert.strictEqual(roleLogs[0].oldRole.toLowerCase(), 'receptionist', 'Old role name mismatch');
      assert.strictEqual(roleLogs[0].newRole.toLowerCase(), 'bartender', 'New role name mismatch');
      assert.strictEqual(roleLogs[0].changedBy, adminUserObj.id, 'Changer ID mismatch');
      console.log('  ✓ Role change audit log successfully verified in DB.');

      // 9.7 Test Deactivation and Login block
      console.log('  9.7 Verifying deactivated account block...');
      // Deactivate receptionist (now bartender)
      const deactivateRes = await fetch(`${BASE_URL}/users/${newRecepId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: false })
      });
      assert.strictEqual(deactivateRes.status, 200, 'Deactivation failed');

      // Try login as deactivated BAR-10
      const blockedLoginRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'BAR-10', password: '9999' })
      });
      const blockedLoginData: any = await blockedLoginRes.json();
      assert.strictEqual(blockedLoginRes.status, 403, 'Deactivated user should return 403 on login');
      assert.strictEqual(blockedLoginData.error.code, 'AUTH_005', 'Deactivated user error code mismatch');
      console.log('✓ Staff Management E2E workflows successfully verified.');

      // 10. Test Card Inventory Management (BRD FR6.3)
      console.log('\nTest Case 10: Card Inventory Management (BRD FR6.3)...');
      
      // 10.1 List all cards
      console.log('  10.1 Verifying GET /api/cards (Admin Only)...');
      const listCardsRes = await fetch(`${BASE_URL}/cards`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const listCardsData: any = await listCardsRes.json();
      assert.strictEqual(listCardsRes.status, 200, 'Listing cards failed');
      assert.ok(Array.isArray(listCardsData), 'Expected cards list to be an array');
      assert.ok(listCardsData.length > 0, 'Expected at least one card in DB');
      
      // 10.2 Block assigned -> available
      console.log('  10.2 Verifying assigned cards cannot be marked available...');
      const card001Uid = card1!.nfcUid;
      await prisma.card.update({
        where: { nfcUid: card001Uid },
        data: { status: 'assigned' }
      });
      const updateAssignedRes = await fetch(`${BASE_URL}/cards/${card001Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'available' })
      });
      const updateAssignedData: any = await updateAssignedRes.json();
      assert.strictEqual(updateAssignedRes.status, 400, 'Assigned card status change to available should be blocked');
      assert.strictEqual(updateAssignedData.error.code, 'CONFLICT_CARD_ASSIGNED', 'Error code mismatch');
      
      // 10.3 Test available -> lost -> reuse block
      console.log('  10.3 Verifying available -> lost transition and lost block rules...');
      const card002Uid = card2!.nfcUid;
      // Mark available card as lost
      const markLostRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'lost' })
      });
      assert.strictEqual(markLostRes.status, 200, 'Marking card lost failed');
      
      // Try to mark lost card as assigned (block)
      const reuseLostAssignedRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'assigned' })
      });
      const reuseLostAssignedData: any = await reuseLostAssignedRes.json();
      assert.strictEqual(reuseLostAssignedRes.status, 400, 'Lost card should not be reusable as assigned');
      assert.strictEqual(reuseLostAssignedData.error.code, 'CONFLICT_CARD_LOST');

      // Recover lost card to available (should succeed)
      const recoverLostRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'available' })
      });
      assert.strictEqual(recoverLostRes.status, 200, 'Recovering lost card to available failed');

      // 10.4 Test available -> damaged -> reuse block
      console.log('  10.4 Verifying available -> damaged transition and damaged block rules...');
      
      // Mark available card as damaged
      const markDamagedRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'damaged' })
      });
      assert.strictEqual(markDamagedRes.status, 200, 'Marking card damaged failed');

      // Try to mark damaged card as assigned (block)
      const reuseDamagedAssignedRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'assigned' })
      });
      const reuseDamagedAssignedData: any = await reuseDamagedAssignedRes.json();
      assert.strictEqual(reuseDamagedAssignedRes.status, 400, 'Damaged card should not be reusable as assigned');
      assert.strictEqual(reuseDamagedAssignedData.error.code, 'CONFLICT_CARD_DAMAGED');

      // Recover damaged card to available (should succeed)
      const recoverDamagedRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'available' })
      });
      assert.strictEqual(recoverDamagedRes.status, 200, 'Recovering damaged card to available failed');

      // 10.5 Test inactive <-> available transitions
      console.log('  10.5 Verifying inactive/active transition rules...');
      // Reset card2 back to available in prisma directly to test inactive logic
      await prisma.card.update({
        where: { nfcUid: card002Uid },
        data: { status: 'available' }
      });

      // Mark available card as inactive
      const markInactiveRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'inactive' })
      });
      assert.strictEqual(markInactiveRes.status, 200, 'Marking card inactive failed');

      // Mark inactive card back to available (allowed)
      const markActiveRes = await fetch(`${BASE_URL}/cards/${card002Uid}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'available' })
      });
      assert.strictEqual(markActiveRes.status, 200, 'Activating card failed');
      const updatedCard2 = await prisma.card.findUnique({ where: { nfcUid: card002Uid } });
      assert.strictEqual(updatedCard2!.status, 'available', 'Card status should be available after reactivation');

      console.log('✓ Card Inventory Management E2E workflows successfully verified.');

      // 11. Test Rate Card Management (BRD FR6.4)
      console.log('\nTest Case 11: Rate Card Management (BRD FR6.4)...');
      
      // 11.1 List all rate cards
      console.log('  11.1 Verifying GET /api/rate-cards...');
      const listRatesRes = await fetch(`${BASE_URL}/rate-cards`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const listRatesData: any = await listRatesRes.json();
      assert.strictEqual(listRatesRes.status, 200, 'Listing rates failed');
      assert.strictEqual(listRatesData.success, true, 'Response success should be true');
      const placeTypes = listRatesData.data.placeTypes;
      assert.ok(Array.isArray(placeTypes), 'Expected placeTypes list to be an array');
      assert.ok(placeTypes.length > 0, 'Expected at least one place type config in DB');
      
      const targetRate = placeTypes[0];
      const rateId = targetRate.id;
      
      // 11.2 Update rate config via plural PUT /api/rate-cards/:id
      console.log('  11.2 Verifying PUT /api/rate-cards/:id updates values...');
      const updateRatesRes = await fetch(`${BASE_URL}/rate-cards/${rateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          placeType: targetRate.name,
          ratePerPerson: 1500,
          baseDurationHours: 4,
          maxDrinksPerPerson: 8
        })
      });
      const updateRatesData: any = await updateRatesRes.json();
      assert.strictEqual(updateRatesRes.status, 200, 'Updating rate card config failed');
      assert.strictEqual(updateRatesData.placeType, targetRate.name, 'Place type name mismatch');
      assert.strictEqual(updateRatesData.ratePerPerson, 1500, 'Price mismatch');
      assert.strictEqual(updateRatesData.baseDurationHours, 4, 'Duration mismatch');
      assert.strictEqual(updateRatesData.maxDrinksPerPerson, 8, 'Drink allowance mismatch');
      
      // Verify in database
      const dbRateConfig = await prisma.placeTypeConfig.findUnique({ where: { id: rateId } });
      assert.ok(dbRateConfig, 'Config not found in DB');
      assert.strictEqual(dbRateConfig.name, targetRate.name);
      assert.strictEqual(dbRateConfig.baseTimeMinutes, 240);
      assert.strictEqual(dbRateConfig.redemptionsPerPerson, 8);
      
      // 11.3 Verify validation rules
      console.log('  11.3 Verifying rate card update validation rules...');
      // 11.3.1 Negative price
      const negPriceRes = await fetch(`${BASE_URL}/rate-cards/${rateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ratePerPerson: -100 })
      });
      assert.strictEqual(negPriceRes.status, 400, 'Negative price should be rejected');

      // 11.3.2 Too short duration (less than 30 mins)
      const shortDurRes = await fetch(`${BASE_URL}/rate-cards/${rateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ baseDurationHours: 0.2 }) // 12 mins
      });
      assert.strictEqual(shortDurRes.status, 400, 'Too short duration should be rejected');

      // 11.3.3 Too long duration (more than 24 hours)
      const longDurRes = await fetch(`${BASE_URL}/rate-cards/${rateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ baseDurationHours: 25 }) // 25 hours
      });
      assert.strictEqual(longDurRes.status, 400, 'Too long duration should be rejected');

      // 11.3.4 Too large drink allowance (> 50)
      const largeDrinksRes = await fetch(`${BASE_URL}/rate-cards/${rateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ maxDrinksPerPerson: 51 })
      });
      assert.strictEqual(largeDrinksRes.status, 400, 'Too large drink allowance should be rejected');

      // 11.3.5 Short place type name (< 2 chars)
      const shortNameRes = await fetch(`${BASE_URL}/rate-cards/${rateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ placeType: 'A' })
      });
      assert.strictEqual(shortNameRes.status, 400, 'Too short place type name should be rejected');

      // 11.4 Verify singular route PUT /api/rate-card/:id also works
      console.log('  11.4 Verifying singular PUT /api/rate-card/:id works...');
      const singularUpdateRes = await fetch(`${BASE_URL}/rate-card/${rateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ratePerPerson: 1000 })
      });
      const singularUpdateData: any = await singularUpdateRes.json();
      assert.strictEqual(singularUpdateRes.status, 200, 'Singular route should succeed');
      assert.strictEqual(singularUpdateData.ratePerPerson, 1000);

      console.log('✓ Rate Card Management E2E workflows successfully verified.');

      // 12. Test Business Reports (BRD FR6.1, FR6.2, FR6.6)
      console.log('\nTest Case 12: Business Reports (BRD FR6.1, FR6.2, FR6.6)...');

      // 12.1 Verify GET /api/reports/sales with day filter
      console.log('  12.1 Verifying GET /api/reports/sales...');
      const salesRes = await fetch(`${BASE_URL}/reports/sales?filter=day`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const salesData: any = await salesRes.json();
      assert.strictEqual(salesRes.status, 200, 'Sales report failed');
      assert.strictEqual(salesData.success, true);
      assert.ok(salesData.data.hasOwnProperty('todaySales'));
      assert.ok(salesData.data.hasOwnProperty('todayRedemptions'));

      // 12.2 Verify GET /api/reports/table-utilization with week filter
      console.log('  12.2 Verifying GET /api/reports/table-utilization...');
      const utilRes = await fetch(`${BASE_URL}/reports/table-utilization?filter=week`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const utilData: any = await utilRes.json();
      assert.strictEqual(utilRes.status, 200, 'Table utilization failed');
      assert.strictEqual(utilData.success, true);
      assert.ok(utilData.data.hasOwnProperty('period'));
      assert.ok(Array.isArray(utilData.data.tables));
      assert.ok(utilData.data.hasOwnProperty('summary'));

      // 12.3 Verify GET /api/reports/hourly-breakdown
      console.log('  12.3 Verifying GET /api/reports/hourly-breakdown...');
      const hourlyRes = await fetch(`${BASE_URL}/reports/hourly-breakdown?filter=day`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const hourlyDataRes: any = await hourlyRes.json();
      assert.strictEqual(hourlyRes.status, 200, 'Hourly breakdown failed');
      assert.strictEqual(hourlyDataRes.success, true);
      assert.ok(Array.isArray(hourlyDataRes.data.hourlyData));
      assert.strictEqual(hourlyDataRes.data.hourlyData.length, 24);
      assert.ok(hourlyDataRes.data.hasOwnProperty('peakHour'));

      // 12.4 Verify GET /api/reports/daily YYYY-MM-DD
      console.log('  12.4 Verifying GET /api/reports/daily...');
      const dailyRes = await fetch(`${BASE_URL}/reports/daily?date=2026-06-20`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dailyData: any = await dailyRes.json();
      assert.strictEqual(dailyRes.status, 200, 'Daily report failed');
      assert.strictEqual(dailyData.success, true);
      assert.strictEqual(dailyData.data.date, '2026-06-20');
      assert.ok(dailyData.data.hasOwnProperty('summary'));
      assert.ok(dailyData.data.hasOwnProperty('byPlaceType'));

      console.log('✓ Business Reports E2E workflows successfully verified.');

      console.log('\n=========================================');
      console.log('ALL OFFLINE SYNC END-TO-END TESTS PASSED!');
      console.log('=========================================\n');
    } catch (e) {
      console.error('Test assertion failed:', e);
      await cleanupDb();
      server.close();
      process.exit(1);
    } finally {
      await cleanupDb();
      server.close();
      process.exit(0);
    }
  });
}

runTests();
