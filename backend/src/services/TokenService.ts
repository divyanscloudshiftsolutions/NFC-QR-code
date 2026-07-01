import { PrismaClient, CloseReason } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import redisService from './RedisService';
import emailNotificationService from './EmailNotificationService';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export interface CreateTokenRequest {
  phoneNumber: string;
  customerName: string;
  email?: string;
  personsCount: number;
  placeTypeId: string;
  tableId: string;
  amountPaid: Decimal | number;
  paymentVerified: boolean;
  issuedBy: string;
  nfcCardUid?: string;
  cardId?: string;
  startTime?: Date | string;
  deliveryMode?: string;
}

export interface SessionSummary {
  token: any;
  sessionSummary: {
    totalRedemptionsUsed: number;
    redemptionsUnused: number;
    totalTimeUsedMinutes: number;
    timeAllocatedMinutes: number;
    timeExtensionMinutes: number;
  };
}

export class TokenService {
  async getConfiguredDeliveryAvailability(): Promise<{ nfcEnabled: boolean; emailQrEnabled: boolean }> {
    const cachedNfc = await redisService.get('config:nfc_card_enabled');
    const cachedEmail = await redisService.get('config:email_qr_enabled');

    let nfcEnabled = cachedNfc === 'true';
    let emailQrEnabled = cachedEmail === 'true';

    if (cachedNfc === null || cachedEmail === null) {
      const configs = await prisma.systemConfig.findMany({
        where: {
          configKey: {
            in: ['nfc_card_enabled', 'email_qr_enabled']
          }
        }
      });
      const nfcRecord = configs.find(c => c.configKey === 'nfc_card_enabled');
      const emailRecord = configs.find(c => c.configKey === 'email_qr_enabled');

      nfcEnabled = nfcRecord ? nfcRecord.configValue === 'true' : true;
      emailQrEnabled = emailRecord ? emailRecord.configValue === 'true' : true;

      await redisService.setex('config:nfc_card_enabled', 86400, nfcEnabled ? 'true' : 'false');
      await redisService.setex('config:email_qr_enabled', 86400, emailQrEnabled ? 'true' : 'false');
    }

    return { nfcEnabled, emailQrEnabled };
  }

  async getConfiguredDeliveryMode(): Promise<string> {
    const { nfcEnabled, emailQrEnabled } = await this.getConfiguredDeliveryAvailability();
    return emailQrEnabled && !nfcEnabled ? 'EMAIL_QR' : 'NFC_CARD';
  }

  generateQRTokenPayload(tokenNumber: string): string {
    return tokenNumber;
  }

  async generateTokenNumber(): Promise<string> {
    const today = new Date();
    // Format: YYYYMMDD (8-digit date format required by nfc.md)
    const yy = today.getFullYear().toString();
    const mm = (today.getMonth() + 1).toString().padStart(2, '0');
    const dd = today.getDate().toString().padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;
    const cacheKey = `daily-sequence:${dateStr}`;
    
    let sequence = await redisService.incr(cacheKey);
    await redisService.expire(cacheKey, 86400); // 24 hours
    
    let tokenNumber = `BAR-${dateStr}-${sequence.toString().padStart(5, '0')}`;
    
    // Safety check: ensure it does not exist in the database (e.g. if Redis key was cleared/wiped)
    let exists = await prisma.token.findUnique({ where: { tokenNumber } });
    while (exists) {
      sequence = await redisService.incr(cacheKey);
      tokenNumber = `BAR-${dateStr}-${sequence.toString().padStart(5, '0')}`;
      exists = await prisma.token.findUnique({ where: { tokenNumber } });
    }
    
    return tokenNumber;
  }

  async getTokenByNumber(tokenNumber: string): Promise<any | null> {
    const cached = await redisService.get(`token:${tokenNumber}`);
    if (cached) return JSON.parse(cached);

    const token = await prisma.token.findUnique({
      where: { tokenNumber },
      include: {
        customer: true,
        placeType: true,
        table: true,
        card: true,
        redemptions: {
          include: {
            bartender: true
          }
        }
      }
    });

    if (token) {
      await redisService.setex(`token:${tokenNumber}`, 86400, JSON.stringify(token));
    }
    return token;
  }

  async createToken(request: CreateTokenRequest): Promise<any> {
    const deliveryMode = request.deliveryMode || await this.getConfiguredDeliveryMode();

    if (deliveryMode === 'EMAIL_QR' && (!request.email || !request.email.trim())) {
      throw new Error('Email address is mandatory when system operates in EMAIL_QR mode.');
    }
    if (deliveryMode === 'NFC_CARD' && (!request.nfcCardUid && !request.cardId)) {
      throw new Error('NFC Card UID is mandatory when system operates in NFC_CARD mode.');
    }

    const tokenNumber = await this.generateTokenNumber();
    
    const token = await prisma.$transaction(async (tx) => {
      // Check for existing active token for phone number
      const existingCustomer = await tx.customer.findUnique({
        where: { phoneNumber: request.phoneNumber },
        include: {
          tokens: {
            where: { status: 'active' },
            take: 1
          }
        }
      });

      if (existingCustomer && existingCustomer.tokens.length > 0) {
        throw new Error('Customer already has an active token');
      }

      // Get or create customer
      let customer: any = existingCustomer;
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            phoneNumber: request.phoneNumber,
            name: request.customerName,
            email: request.email || null,
            totalVisits: 1
          }
        });
      } else {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: {
            totalVisits: { increment: 1 },
            lastVisit: new Date(),
            name: request.customerName,
            email: request.email || customer.email
          }
        });
      }

      // Get place type
      const placeType = await tx.placeTypeConfig.findUnique({
        where: { id: request.placeTypeId }
      });

      if (!placeType) {
        throw new Error('Invalid place type');
      }

      // Seating capacity bounds validation
      const table = await tx.table.findUnique({
        where: { id: request.tableId }
      });
      if (!table) {
        throw new Error('Table not found');
      }
      if (request.personsCount > table.capacity) {
        throw new Error(`Group size of ${request.personsCount} exceeds table capacity of ${table.capacity}.`);
      }

      // Calculate end time
      const start = request.startTime ? new Date(request.startTime) : new Date();
      const endTime = new Date(start.getTime() + placeType.baseTimeMinutes * 60 * 1000);

      // Calculate total redemptions
      const totalRedemptionsAllowed = request.personsCount * placeType.redemptionsPerPerson;

      // Find Card and validate status (only in NFC mode or if provided)
      let cardId = request.cardId;
      const finalCardUid = request.nfcCardUid;
      if (deliveryMode === 'NFC_CARD' && (cardId || finalCardUid)) {
        const card = cardId 
          ? await tx.card.findUnique({ where: { id: cardId } })
          : await tx.card.findUnique({ where: { nfcUid: finalCardUid } });
        if (!card) throw new Error('NFC card not registered');
        if (card.status !== 'available') {
          throw new Error(`NFC card cannot be assigned. Card status is currently '${card.status}'.`);
        }
        cardId = card.id;
      }

      // Server-side pricing calculation using Decimal math to preserve precision
      const ratePerPerson = placeType.ratePerPerson; // Decimal
      const amountPaid = ratePerPerson.mul(request.personsCount); // Single source of truth (Decimal)

      // Create token
      const token = await tx.token.create({
        data: {
          tokenNumber,
          customerId: customer.id,
          personsCount: request.personsCount,
          placeTypeId: request.placeTypeId,
          tableId: request.tableId,
          amountPaid: amountPaid,
          paymentVerified: request.paymentVerified,
          startTime: start,
          endTime,
          totalRedemptionsAllowed,
          redemptionsUsed: 0,
          status: 'active',
          issuedBy: request.issuedBy,
          deliveryMode: deliveryMode,
          emailSent: false,
          emailDeliveryStatus: deliveryMode === 'EMAIL_QR' ? 'PENDING' : null
        },
        include: {
          customer: true,
          placeType: true,
          table: true
        }
      });

      // Update Card status to assigned and set current_token_id (1-to-1 schema relation)
      if (deliveryMode === 'NFC_CARD' && cardId) {
        await tx.card.update({
          where: { id: cardId },
          data: {
            status: 'assigned',
            assignedAt: new Date(),
            currentTokenId: token.id
          }
        });
      }

      // Note: Table status and occupancy logs are updated automatically by trigger in PostgreSQL!
      // Invalidate caches manually to keep in sync
      await redisService.del(`table:available:${request.placeTypeId}`);
      await redisService.del('table:available:all');
      await redisService.del(`table:${request.tableId}:status`);

      // Cache token
      await redisService.setex(
        `token:${tokenNumber}`,
        86400,
        JSON.stringify(token)
      );

      // Cache card active token mapping if in NFC Mode
      if (deliveryMode === 'NFC_CARD' && request.nfcCardUid) {
        await redisService.setex(
          `token:active:${request.nfcCardUid}`,
          86400,
          JSON.stringify({ tokenId: token.id, tokenNumber })
        );
      }

      await redisService.setex(
        `customer:active:${request.phoneNumber}`,
        86400,
        JSON.stringify({ tokenId: token.id, tokenNumber })
      );

      return token;
    });

    if (deliveryMode === 'EMAIL_QR' && request.email) {
      emailNotificationService.enqueueEmailJob(request.email.trim().toLowerCase(), token.tokenNumber, request.customerName);
    }

    return token;
  }

  async extendToken(
    tokenNumber: string,
    extraMinutes: number,
    additionalAmount: Decimal | number,
    approvedBy: string,
    additionalPersons: number = 0
  ): Promise<any> {
    return await prisma.$transaction(async (tx) => {
      // Lock row
      const tokens = await tx.$queryRaw<any[]>`
        SELECT id, status, end_time as "endTime", amount_paid as "amountPaid"
        FROM tokens
        WHERE token_number = ${tokenNumber}
        FOR UPDATE
      `;

      if (!tokens || tokens.length === 0) throw new Error('Token not found');
      const token = tokens[0];

      if (token.status !== 'active' && token.status !== 'expired' && token.status !== 'extended') {
        throw new Error(`Cannot extend token with status: ${token.status}`);
      }

      // Get place type and persons count to compute the server-side single source of truth for additionalAmount
      const tokenObj = await tx.token.findUnique({
        where: { id: token.id },
        include: { placeType: true }
      });
      if (!tokenObj) throw new Error('Token details not found');

      const placeType = tokenObj.placeType;
      const additionalAmountDec = new Decimal(additionalAmount);
      
      // Calculate server-side computed amount:
      // cover fee for new persons + extension fee for existing group members
      const newCoverFee = placeType.ratePerPerson.mul(additionalPersons);
      const extensionFee = placeType.ratePerPerson
        .mul(extraMinutes)
        .mul(tokenObj.personsCount)
        .div(placeType.baseTimeMinutes);
      const computedAmount = extensionFee.add(newCoverFee);

      // If additionalAmount is explicitly 0, we treat it as a free extension (allowed by rules).
      // Otherwise, the server is the single source of truth and recalculates it.
      const finalAdditionalAmount = additionalAmountDec.eq(0) ? new Decimal(0) : computedAmount;

      const currentEndTime = new Date(token.endTime);
      // Extend relative to current end_time if not expired yet, or from now if already expired
      const baseTime = currentEndTime.getTime() > Date.now() ? currentEndTime : new Date();
      const newEndTime = new Date(baseTime.getTime() + extraMinutes * 60 * 1000);

      // If token was expired, set to extended
      const newStatus = token.status === 'expired' ? 'extended' : token.status;

      const addedDrinks = additionalPersons * placeType.redemptionsPerPerson;

      const updatedToken = await tx.token.update({
        where: { id: token.id },
        data: {
          endTime: newEndTime,
          status: newStatus,
          personsCount: {
            increment: additionalPersons
          },
          totalRedemptionsAllowed: {
            increment: addedDrinks
          },
          amountPaid: {
            increment: finalAdditionalAmount
          }
        },
        include: {
          customer: true,
          placeType: true,
          table: true
        }
      });

      // Log extension
      await tx.tokenExtension.create({
        data: {
          tokenId: token.id,
          extraMinutes,
          additionalAmount: finalAdditionalAmount,
          approvedBy,
          newEndTime,
          extendedAt: new Date()
        }
      });

      // Update cache
      await redisService.setex(
        `token:${tokenNumber}`,
        86400,
        JSON.stringify(updatedToken)
      );

      return updatedToken;
    });
  }

  async reconcileMaintenanceTables(): Promise<void> {
    const now = new Date();
    const expiredTables = await prisma.table.findMany({
      where: {
        status: 'maintenance',
        maintenanceEnd: { lte: now }
      }
    });

    if (expiredTables.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const table of expiredTables) {
          const freshTable = await tx.table.findUnique({
            where: { id: table.id }
          });
          if (freshTable && freshTable.status === 'maintenance' && freshTable.maintenanceEnd && freshTable.maintenanceEnd <= now) {
            await tx.table.update({
              where: { id: table.id },
              data: {
                status: 'available',
                maintenanceStart: null,
                maintenanceEnd: null
              }
            });
            await redisService.del(`table:${table.id}:status`);
          }
        }
      });
      await redisService.del('table:available:all');
    }
  }

  async closeSession(
    tokenNumber: string,
    closedBy: string,
    closeReason: CloseReason,
    eraseCard: boolean
  ): Promise<SessionSummary> {
    const now = new Date();
    return await prisma.$transaction(async (tx) => {
      // 1. Pessimistic row-locking on Token
      const tokens = await tx.$queryRaw<any[]>`
        SELECT id, status, "table_id" as "tableId", "customer_id" as "customerId",
               "start_time" as "startTime", "end_time" as "endTime",
               "total_redemptions_allowed" as "totalRedemptionsAllowed", "redemptions_used" as "redemptionsUsed",
               "delivery_mode" as "deliveryMode", "payment_verified" as "paymentVerified"
        FROM tokens
        WHERE token_number = ${tokenNumber}
        LIMIT 1
        FOR UPDATE
      `;

      if (!tokens || tokens.length === 0) {
        throw new Error('Token not found');
      }

      const token = tokens[0];

      // Idempotency check: if already closed, throw CONFLICT error
      if (token.status === 'closed') {
        const error = new Error('This session has already been closed.') as any;
        error.code = 'CONFLICT';
        throw error;
      }

      // Verify token is in a valid state to be closed
      if (token.status !== 'active' && token.status !== 'extended' && token.status !== 'expired') {
        throw new Error(`Cannot close token with status: ${token.status}`);
      }

      // Prevent closing unpaid pending QR sessions
      if (token.deliveryMode === 'EMAIL_QR' && !token.paymentVerified) {
        throw new Error('Cannot close an unpaid pending QR session.');
      }

      const totalTimeUsedMinutes = Math.floor(
        (now.getTime() - new Date(token.startTime).getTime()) / 60000
      );

      const fullToken = await tx.token.findUnique({
        where: { id: token.id },
        include: {
          customer: true,
          placeType: true,
          table: true,
          card: true,
          redemptions: true,
          extensions: true
        }
      });

      if (!fullToken) throw new Error('Token details not found');

      const totalExtensionMinutes = fullToken.extensions.reduce((acc: number, ext: any) => acc + ext.extraMinutes, 0);

      // Update token status
      const updatedToken = await tx.token.update({
        where: { id: token.id },
        data: {
          status: 'closed',
          closedAt: now,
          closedBy,
          closeReason
        },
        include: {
          customer: true,
          placeType: true,
          table: true
        }
      });

      // Update table status to maintenance (5 minutes duration)
      const maintenanceDurationMs = 5 * 60000;
      const maintenanceStart = now;
      const maintenanceEnd = new Date(now.getTime() + maintenanceDurationMs);

      await tx.table.update({
        where: { id: token.tableId },
        data: {
          status: 'maintenance',
          currentTokenId: null,
          occupiedSince: null,
          maintenanceStart,
          maintenanceEnd
        }
      });

      // Update occupancy logs
      await tx.tableOccupancyLog.updateMany({
        where: {
          tableId: token.tableId,
          tokenId: token.id,
          vacatedAt: null
        },
        data: { vacatedAt: now }
      });

      // Update card status if requested
      if (fullToken.card && eraseCard) {
        await tx.card.update({
          where: { id: fullToken.card.id },
          data: {
            status: 'available',
            returnedAt: now,
            writeCycles: { increment: 1 },
            currentTokenId: null
          }
        });
      }

      // Invalidate caches
      await redisService.del(`token:${tokenNumber}`);
      await redisService.del(`customer:active:${fullToken.customer.phoneNumber}`);
      if (fullToken.card) {
        await redisService.del(`token:active:${fullToken.card.nfcUid}`);
      }
      await redisService.del(`table:available:${token.placeTypeId}`);
      await redisService.del('table:available:all');
      await redisService.del(`table:${token.tableId}:status`);

      return {
        token: updatedToken,
        sessionSummary: {
          totalRedemptionsUsed: token.redemptionsUsed,
          redemptionsUnused: token.totalRedemptionsAllowed - token.redemptionsUsed,
          totalTimeUsedMinutes,
          timeAllocatedMinutes: fullToken.placeType.baseTimeMinutes,
          timeExtensionMinutes: totalExtensionMinutes
        }
      };
    });
  }

  async closeToken(
    tokenNumber: string,
    closedBy: string,
    eraseCard: boolean
  ): Promise<SessionSummary> {
    return this.closeSession(tokenNumber, closedBy, CloseReason.CHECKOUT, eraseCard);
  }
}

export const tokenService = new TokenService();
export default tokenService;
