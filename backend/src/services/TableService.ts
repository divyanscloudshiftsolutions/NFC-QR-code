import { PrismaClient } from '@prisma/client';
import redisService from './RedisService';

const prisma = new PrismaClient();

export interface TableOccupancyDetails {
  id: string;
  tableNumber: string;
  status: string;
  capacity: number;
  currentToken: {
    id: string;
    tokenNumber: string;
    customerName: string;
    phoneNumber: string;
    email?: string;
    personsCount: number;
    occupiedSince: Date | null;
    timeRemainingMinutes: number;
    redemptionsUsed: number;
    totalRedemptionsAllowed: number;
    remainingDrinks: number;
    sessionStartTime: Date;
    sessionEndTime: Date;
    cardUid: string;
    status: string;
  } | null;
}

export interface OccupancyReport {
  byPlaceType: Record<string, {
    total: number;
    occupied: number;
    available: number;
    tables: TableOccupancyDetails[];
  }>;
}

export class TableService {
  async getTableById(tableId: string) {
    return await prisma.table.findUnique({
      where: { id: tableId },
      include: { placeType: true },
    });
  }

  async getAvailableTables(placeTypeId?: string): Promise<any[]> {
    const cacheKey = placeTypeId 
      ? `table:available:${placeTypeId}` 
      : 'table:available:all';
    
    const cached = await redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const where: any = { status: 'available', isActive: true };
    if (placeTypeId) where.placeTypeId = placeTypeId;

    const tables = await prisma.table.findMany({
      where,
      include: { placeType: true },
      orderBy: { tableNumber: 'asc' }
    });

    await redisService.setex(cacheKey, 300, JSON.stringify(tables));
    return tables;
  }

  async assignTableToToken(tableId: string, tokenId: string): Promise<any> {
    return await prisma.$transaction(async (tx) => {
      // Lock the table for update using Raw SQL to prevent concurrent assignments
      const tables = await tx.$queryRaw<any[]>`
        SELECT id, status, "place_type_id" as "placeTypeId" 
        FROM tables 
        WHERE id = ${tableId}::uuid 
        FOR UPDATE
      `;

      if (!tables || tables.length === 0) {
        throw new Error('Table not found');
      }
      const table = tables[0];

      if (table.status !== 'available') {
        throw new Error(`Table is currently ${table.status}`);
      }

      // Update table status
      const updatedTable = await tx.table.update({
        where: { id: tableId },
        data: {
          status: 'occupied',
          currentTokenId: tokenId,
          occupiedSince: new Date(),
          lastAssignedAt: new Date()
        }
      });

      // Create occupancy log
      await tx.tableOccupancyLog.create({
        data: {
          tableId,
          tokenId,
          occupiedAt: new Date()
        }
      });

      // Invalidate cache
      await redisService.del(`table:available:${table.placeTypeId}`);
      await redisService.del('table:available:all');
      await redisService.del(`table:${tableId}:status`);

      return updatedTable;
    });
  }

  async releaseTable(tableId: string, tokenId: string): Promise<any> {
    return await prisma.$transaction(async (tx) => {
      const table = await tx.table.findUnique({
        where: { id: tableId }
      });

      if (!table) throw new Error('Table not found');
      if (table.currentTokenId !== tokenId) {
        throw new Error('Token does not match current table assignment');
      }

      // Update occupancy log with vacated time
      await tx.tableOccupancyLog.updateMany({
        where: {
          tableId,
          tokenId,
          vacatedAt: null
        },
        data: { vacatedAt: new Date() }
      });

      // Release table
      const updatedTable = await tx.table.update({
        where: { id: tableId },
        data: {
          status: 'available',
          currentTokenId: null,
          occupiedSince: null
        }
      });

      // Invalidate cache
      await redisService.del(`table:available:${table.placeTypeId}`);
      await redisService.del('table:available:all');
      await redisService.del(`table:${tableId}:status`);

      return updatedTable;
    });
  }

  async getTableOccupancy(placeTypeId?: string): Promise<OccupancyReport> {
    const tables = await prisma.table.findMany({
      where: placeTypeId ? { placeTypeId, isActive: true } : { isActive: true },
      include: {
        placeType: true,
        tokens: {
          where: { status: { in: ['active', 'extended', 'expired'] } },
          include: {
            customer: true,
            card: true
          },
          orderBy: { startTime: 'desc' },
          take: 1
        }
      }
    });

    const byPlaceType: Record<string, any> = {};
    
    for (const table of tables) {
      const typeName = table.placeType.name;
      if (!byPlaceType[typeName]) {
        byPlaceType[typeName] = {
          total: 0,
          occupied: 0,
          available: 0,
          tables: []
        };
      }
      
      byPlaceType[typeName].total++;
      if (table.status === 'occupied') {
        byPlaceType[typeName].occupied++;
        const currentToken = table.tokens[0] || null;
        byPlaceType[typeName].tables.push({
          id: table.id,
          tableNumber: table.tableNumber,
          status: table.status,
          capacity: table.capacity,
          currentToken: currentToken ? {
            id: currentToken.id,
            tokenNumber: currentToken.tokenNumber,
            customerName: currentToken.customer.name,
            phoneNumber: currentToken.customer.phoneNumber,
            email: currentToken.customer.email || undefined,
            personsCount: currentToken.personsCount,
            occupiedSince: table.occupiedSince,
            timeRemainingMinutes: this.calculateTimeRemaining(currentToken.endTime),
            redemptionsUsed: currentToken.redemptionsUsed,
            totalRedemptionsAllowed: currentToken.totalRedemptionsAllowed,
            remainingDrinks: Math.max(0, currentToken.totalRedemptionsAllowed - currentToken.redemptionsUsed),
            sessionStartTime: currentToken.startTime,
            sessionEndTime: currentToken.endTime,
            cardUid: currentToken.card?.nfcUid || '',
            status: currentToken.status
          } : null
        });
      } else {
        byPlaceType[typeName].available++;
        byPlaceType[typeName].tables.push({
          id: table.id,
          tableNumber: table.tableNumber,
          status: table.status,
          capacity: table.capacity,
          currentToken: null
        });
      }
    }

    return { byPlaceType };
  }

  private calculateTimeRemaining(endTime: Date): number {
    const remaining = Math.max(0, endTime.getTime() - Date.now());
    return Math.floor(remaining / 60000);
  }
}

export const tableService = new TableService();
export default tableService;
