import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Database Initialization & Seeding ---');

  // Clear existing transaction data for a clean reset
  console.log('Wiping existing transaction tables...');
  await prisma.redemption.deleteMany({});
  await prisma.tokenExtension.deleteMany({});
  await prisma.tableOccupancyLog.deleteMany({});
  await prisma.token.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.card.deleteMany({});
  await prisma.table.deleteMany({});
  console.log('Transaction tables, seating tables, and card inventory cleared.');

  // 1. Create triggers in PostgreSQL database using raw SQL
  console.log('Creating triggers...');

  const creationTriggerFunction = `
    CREATE OR REPLACE FUNCTION update_table_on_token_creation()
    RETURNS TRIGGER AS $$
    BEGIN
        UPDATE tables 
        SET status = 'occupied',
            current_token_id = NEW.id,
            occupied_since = NEW.start_time,
            last_assigned_at = NEW.start_time,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.table_id;
        
        INSERT INTO table_occupancy_logs (id, table_id, token_id, occupied_at)
        VALUES (gen_random_uuid(), NEW.table_id, NEW.id, NEW.start_time);
        
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  const closeTriggerFunction = `
    CREATE OR REPLACE FUNCTION update_table_on_token_close()
    RETURNS TRIGGER AS $$
    BEGIN
        IF OLD.status != 'closed' AND NEW.status = 'closed' THEN
            UPDATE tables 
            SET status = 'available',
                current_token_id = NULL,
                occupied_since = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.table_id AND current_token_id = NEW.id;
            
            UPDATE table_occupancy_logs 
            SET vacated_at = NEW.closed_at
            WHERE table_id = NEW.table_id AND token_id = NEW.id AND vacated_at IS NULL;
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  await prisma.$executeRawUnsafe(creationTriggerFunction);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trigger_update_table_on_token_creation ON tokens;`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER trigger_update_table_on_token_creation
    AFTER INSERT ON tokens
    FOR EACH ROW
    WHEN (NEW.status = 'ACTIVE')
    EXECUTE FUNCTION update_table_on_token_creation();
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trigger_update_table_on_token_close ON tokens;`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS update_table_on_token_close();`);

  console.log('Triggers successfully installed.');

  // Create partial unique indexes and check constraints
  console.log('Creating unique indexes and check constraints...');
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS uq_customer_active_token;`);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX uq_customer_active_token 
    ON tokens(customer_id) 
    WHERE status IN ('ACTIVE', 'EXTENDED');
  `);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS uq_table_active_token;`);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX uq_table_active_token 
    ON tokens(table_id) 
    WHERE status IN ('ACTIVE', 'EXTENDED', 'EXPIRED');
  `);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS uq_card_active_token;`);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX uq_card_active_token 
    ON cards(current_token_id) 
    WHERE current_token_id IS NOT NULL;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tables DROP CONSTRAINT IF EXISTS chk_table_capacity;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tables ADD CONSTRAINT chk_table_capacity CHECK (capacity BETWEEN 1 AND 20);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_persons_count_check;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tokens ADD CONSTRAINT tokens_persons_count_check CHECK (persons_count BETWEEN 1 AND 20);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_redemptions_used_check;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tokens ADD CONSTRAINT tokens_redemptions_used_check CHECK (redemptions_used <= total_redemptions_allowed);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE place_types DROP CONSTRAINT IF EXISTS chk_rate_non_negative;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE place_types ADD CONSTRAINT chk_rate_non_negative CHECK (rate_per_person >= 0);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tokens DROP CONSTRAINT IF EXISTS chk_amount_paid_non_negative;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tokens ADD CONSTRAINT chk_amount_paid_non_negative CHECK (amount_paid >= 0);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE token_extensions DROP CONSTRAINT IF EXISTS chk_additional_amount_non_negative;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE token_extensions ADD CONSTRAINT chk_additional_amount_non_negative CHECK (additional_amount >= 0);
  `);

  // 2. Seed Roles
  console.log('Seeding roles...');
  const roleSpecs = [
    {
      name: 'admin',
      permissions: {
        create_token: true,
        extend_token: true,
        close_token: true,
        view_tables: true,
        process_redemption: true,
        manage_rates: true,
      },
    },
    {
      name: 'receptionist',
      permissions: {
        create_token: true,
        extend_token: true,
        close_token: true,
        view_tables: true,
      },
    },
    {
      name: 'bartender',
      permissions: {
        process_redemption: true,
        view_tokens: true,
      },
    },
    {
      name: 'manager',
      permissions: {
        view_tables: true,
        view_tokens: true,
        view_reports: true,
      },
    },
  ];

  const dbRoles: Record<string, string> = {};
  for (const role of roleSpecs) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { permissions: role.permissions },
      create: { name: role.name, permissions: role.permissions },
    });
    dbRoles[role.name] = createdRole.id;
  }
  console.log('Roles seeded.');

  // 3. Seed Users
  console.log('Seeding users...');
  const userSpecs = [
    {
      username: 'admin',
      fullName: 'Divyan',
      passwordHash: await bcrypt.hash('admin123', 12),
      roleId: dbRoles['admin'],
      isActive: true,
    },
    {
      username: 'receptionist',
      fullName: 'Sarah Receptionist',
      passwordHash: await bcrypt.hash('recep123', 12),
      roleId: dbRoles['receptionist'],
      isActive: true,
    },
    {
      username: 'bartender',
      fullName: 'John Bartender',
      passwordHash: await bcrypt.hash('bar123', 12),
      roleId: dbRoles['bartender'],
      isActive: true,
    },
    {
      username: 'manager',
      fullName: 'David Manager',
      passwordHash: await bcrypt.hash('manager123', 12),
      roleId: dbRoles['manager'],
      isActive: true,
    },
  ];

  for (const u of userSpecs) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        fullName: u.fullName,
        passwordHash: u.passwordHash,
        roleId: u.roleId,
        isActive: u.isActive,
      },
      create: u,
    });
  }
  console.log('Users seeded.');

  // 4. Seed Place Types Config
  console.log('Seeding place types...');
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
    const createdPt = await prisma.placeTypeConfig.upsert({
      where: { name: pt.name },
      update: pt,
      create: pt,
    });
    dbPlaceTypes[pt.name] = createdPt.id;
  }
  console.log('Place types seeded.');

  // 5. Seed Tables
  console.log('Seeding tables...');
  const seatCapacities = [2, 4, 6];

  // Standard tables S-01 to S-15
  for (let i = 1; i <= 15; i++) {
    const tableNumber = `S-${String(i).padStart(2, '0')}`;
    const capacity = seatCapacities[(i - 1) % seatCapacities.length];
    await prisma.table.upsert({
      where: {
        tableNumber_placeTypeId: {
          tableNumber,
          placeTypeId: dbPlaceTypes['STANDING_BAR'],
        },
      },
      update: {
        capacity,
        status: 'available',
        isActive: true,
      },
      create: {
        tableNumber,
        placeTypeId: dbPlaceTypes['STANDING_BAR'],
        capacity,
        status: 'available',
        isActive: true,
      },
    });
  }

  // Premium tables L-01 to L-10
  for (let i = 1; i <= 10; i++) {
    const tableNumber = `L-${String(i).padStart(2, '0')}`;
    const capacity = seatCapacities[(i - 1) % seatCapacities.length];
    await prisma.table.upsert({
      where: {
        tableNumber_placeTypeId: {
          tableNumber,
          placeTypeId: dbPlaceTypes['PREMIUM_LOUNGE'],
        },
      },
      update: {
        capacity,
        status: 'available',
        isActive: true,
      },
      create: {
        tableNumber,
        placeTypeId: dbPlaceTypes['PREMIUM_LOUNGE'],
        capacity,
        status: 'available',
        isActive: true,
      },
    });
  }
  console.log('Tables seeded.');

  // 6. Seed Cards
  console.log('Seeding cards...');
  for (let i = 1; i <= 50; i++) {
    const nfcUid = `CARD-${String(i).padStart(3, '0')}`;
    await prisma.card.upsert({
      where: { nfcUid },
      update: { status: 'available' },
      create: {
        nfcUid,
        status: 'available',
        writeCycles: 0,
      },
    });
  }
  console.log('Cards seeded.');

  // 7. Seed System Configurations
  console.log('Seeding system configs...');
  await prisma.systemConfig.upsert({
    where: { configKey: 'nfc_card_enabled' },
    update: {},
    create: {
      configKey: 'nfc_card_enabled',
      configValue: 'true',
    },
  });
  await prisma.systemConfig.upsert({
    where: { configKey: 'email_qr_enabled' },
    update: {},
    create: {
      configKey: 'email_qr_enabled',
      configValue: 'true',
    },
  });
  console.log('System configs seeded.');
  console.log('--- Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
