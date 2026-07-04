import { PrismaClient } from '@prisma/client';

const prodDbUrl = 'postgresql://neondb_owner:npg_5Rg2pVkinGIB@ep-dry-snow-aon2oy5o.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const prisma = new PrismaClient({
  datasources: {
    db: { url: prodDbUrl }
  }
});

async function main() {
  console.log('Querying all tables in the database...');
  
  // Find all tables
  const tables = await prisma.table.findMany({
    include: {
      placeType: true
    }
  });

  console.log('=== All Tables ===');
  console.log(tables.map((t: any) => ({
    id: t.id,
    tableNumber: t.tableNumber,
    isOccupied: t.isOccupied,
    placeType: t.placeType?.name
  })));

  // Find all tokens in the database
  const tokens = await prisma.token.findMany({
    include: { customer: true, table: true }
  });
  console.log('=== All Tokens ===');
  console.log(tokens.map((tk: any) => ({
    id: tk.id,
    tokenNumber: tk.tokenNumber,
    status: tk.status,
    tableNumber: tk.table?.tableNumber,
    customerName: tk.customer?.name,
    customerPhone: tk.customer?.phoneNumber,
    customerEmail: tk.customer?.email,
    startTime: tk.startTime,
    endTime: tk.endTime
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
