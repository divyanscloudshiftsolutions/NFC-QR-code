import { PrismaClient, CloseReason, ActivationMethod, CancelReason } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import redisService from './RedisService';
import emailNotificationService from './EmailNotificationService';
import jwt from 'jsonwebtoken';

const TokenStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT' as const,
  ACTIVE: 'ACTIVE' as const,
  CLOSED: 'CLOSED' as const,
  CANCELLED: 'CANCELLED' as const,
  EXPIRED: 'EXPIRED' as const,
  EXTENDED: 'EXTENDED' as const,
};
type TokenStatus = (typeof TokenStatus)[keyof typeof TokenStatus];

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
      // Check for existing active or pending sessions by phone or email
      const orConditions: any[] = [
        { customer: { phoneNumber: request.phoneNumber } }
      ];
      if (request.email && request.email.trim()) {
        orConditions.push({ customer: { email: request.email.trim().toLowerCase() } });
      }

      const activeOrPendingToken = await tx.token.findFirst({
        where: {
          OR: orConditions,
          status: {
            in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED, TokenStatus.PENDING_PAYMENT, TokenStatus.EXPIRED]
          }
        },
        include: { customer: true }
      });

      if (activeOrPendingToken) {
        const isPending = activeOrPendingToken.status === TokenStatus.PENDING_PAYMENT;
        const msg = isPending
          ? `A pending payment session already exists for this customer (Phone: ${activeOrPendingToken.customer.phoneNumber}, Email: ${activeOrPendingToken.customer.email || 'N/A'}).`
          : `Customer already has an active session (Phone: ${activeOrPendingToken.customer.phoneNumber}, Email: ${activeOrPendingToken.customer.email || 'N/A'}).`;
        
        const err = new Error(msg) as any;
        err.code = isPending ? 'PENDING_SESSION_EXISTS' : 'ACTIVE_SESSION_EXISTS';
        err.tokenNumber = activeOrPendingToken.tokenNumber;
        throw err;
      }

      // Check for existing customer profile
      const existingCustomer = await tx.customer.findUnique({
        where: { phoneNumber: request.phoneNumber }
      }) as any;

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
          status: TokenStatus.ACTIVE,
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

      if (token.status !== 'ACTIVE' && token.status !== 'EXPIRED' && token.status !== 'EXTENDED') {
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
      const newStatus = token.status === 'EXPIRED' ? TokenStatus.EXTENDED : (token.status as TokenStatus);

      const hourlyDrinksRate = placeType.redemptionsPerPerson / (placeType.baseTimeMinutes / 60);
      const extensionDrinks = Math.floor((extraMinutes / 60) * hourlyDrinksRate * tokenObj.personsCount);
      const totalAddedDrinks = extensionDrinks + (additionalPersons * placeType.redemptionsPerPerson);

      const updatedToken = await tx.token.update({
        where: { id: token.id },
        data: {
          endTime: newEndTime,
          status: newStatus,
          personsCount: {
            increment: additionalPersons
          },
          totalRedemptionsAllowed: {
            increment: totalAddedDrinks
          },
          amountPaid: {
            increment: finalAdditionalAmount
          }
        },
        include: {
          customer: true,
          placeType: true,
          table: true,
          card: true
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

      if (updatedToken.card?.nfcUid) {
        await redisService.del(`token:active:${updatedToken.card.nfcUid}`);
      }

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

    // Reconcile expired pending payment sessions (e.g. 20 minutes expiry)
    const expiryWindowMinutes = 20;
    const expiryTime = new Date(now.getTime() - expiryWindowMinutes * 60 * 1000);
    const expiredPendingTokens = await prisma.token.findMany({
      where: {
        status: TokenStatus.PENDING_PAYMENT,
        issuedAt: { lte: expiryTime }
      }
    });

    if (expiredPendingTokens.length > 0) {
      await prisma.token.updateMany({
        where: {
          id: { in: expiredPendingTokens.map(t => t.id) }
        },
        data: {
          status: TokenStatus.EXPIRED
        }
      });
      for (const t of expiredPendingTokens) {
        await redisService.del(`token:${t.tokenNumber}`);
      }
    }
  }

  async closeSession(
    tokenNumber: string,
    closedBy: string,
    closeReason: CloseReason,
    eraseCard: boolean,
    force: boolean = false
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
      if (token.status === 'CLOSED' && !force) {
        const error = new Error('This session has already been closed.') as any;
        error.code = 'CONFLICT';
        throw error;
      }

      // Prevent closing unpaid pending QR sessions
      if (token.deliveryMode === 'EMAIL_QR' && !token.paymentVerified && !force) {
        throw new Error('Cannot close an unpaid pending QR session.');
      }

      // Verify token is in a valid state to be closed
      if (token.status !== 'ACTIVE' && token.status !== 'EXTENDED' && token.status !== 'EXPIRED' && !force) {
        throw new Error(`Cannot close token with status: ${token.status}`);
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
          status: TokenStatus.CLOSED,
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

      // Update table status
      if (token.tableId) {
        const maintenanceDurationMs = 5 * 60000;
        const maintenanceStart = now;
        const maintenanceEnd = new Date(now.getTime() + maintenanceDurationMs);

        await tx.table.update({
          where: { id: token.tableId },
          data: {
            status: force ? 'available' : 'maintenance',
            currentTokenId: null,
            occupiedSince: null,
            maintenanceStart: force ? null : maintenanceStart,
            maintenanceEnd: force ? null : maintenanceEnd
          }
        });
      }

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

  async createPendingToken(request: {
    phoneNumber: string;
    customerName: string;
    email: string;
    personsCount: number;
    placeTypeId: string;
    issuedBy: string;
    tableId?: string;
    tableNumber?: string;
  }): Promise<any> {
    const tokenNumber = await this.generateTokenNumber();
    const start = new Date();

    return await prisma.$transaction(async (tx) => {
      // Check for existing active or pending sessions by phone or email
      const orConditions: any[] = [
        { customer: { phoneNumber: request.phoneNumber } }
      ];
      if (request.email && request.email.trim()) {
        orConditions.push({ customer: { email: request.email.trim().toLowerCase() } });
      }

      const activeOrPendingToken = await tx.token.findFirst({
        where: {
          OR: orConditions,
          status: {
            in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED, TokenStatus.PENDING_PAYMENT, TokenStatus.EXPIRED]
          }
        },
        include: { customer: true }
      });

      if (activeOrPendingToken) {
        const isPending = activeOrPendingToken.status === TokenStatus.PENDING_PAYMENT;
        const msg = isPending
          ? `A pending payment session already exists for this customer (Phone: ${activeOrPendingToken.customer.phoneNumber}, Email: ${activeOrPendingToken.customer.email || 'N/A'}).`
          : `Customer already has an active session (Phone: ${activeOrPendingToken.customer.phoneNumber}, Email: ${activeOrPendingToken.customer.email || 'N/A'}).`;
        
        const err = new Error(msg) as any;
        err.code = isPending ? 'PENDING_SESSION_EXISTS' : 'ACTIVE_SESSION_EXISTS';
        err.tokenNumber = activeOrPendingToken.tokenNumber;
        throw err;
      }

      // Get or create customer
      const existingCustomer = await tx.customer.findUnique({
        where: { phoneNumber: request.phoneNumber }
      }) as any;

      // Get or create customer
      let customer = existingCustomer;
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            phoneNumber: request.phoneNumber,
            name: request.customerName,
            email: request.email,
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
            email: request.email
          }
        });
      }

      const placeType = await tx.placeTypeConfig.findUnique({
        where: { id: request.placeTypeId }
      });
      if (!placeType) {
        throw new Error('Invalid place type');
      }

      const endTime = new Date(start.getTime() + placeType.baseTimeMinutes * 60 * 1000);
      const totalRedemptionsAllowed = request.personsCount * placeType.redemptionsPerPerson;

      let resolvedTableId: string | null = null;
      if (request.tableId || request.tableNumber) {
        const table = await tx.table.findFirst({
          where: request.tableId
            ? { id: request.tableId }
            : { tableNumber: request.tableNumber, placeTypeId: request.placeTypeId }
        });
        if (!table) {
          throw new Error('Table not found or does not match selected place type.');
        }
        if (table.status !== 'available') {
          throw new Error(`Table '${table.tableNumber}' is not available.`);
        }
        if (request.personsCount > table.capacity) {
          throw new Error(`Group size of ${request.personsCount} exceeds table capacity of ${table.capacity}.`);
        }
        resolvedTableId = table.id;
      }

      const token = await tx.token.create({
        data: {
          tokenNumber,
          customerId: customer.id,
          personsCount: request.personsCount,
          placeTypeId: request.placeTypeId,
          tableId: resolvedTableId,
          amountPaid: 0,
          paymentVerified: false,
          startTime: start,
          endTime,
          totalRedemptionsAllowed,
          redemptionsUsed: 0,
          status: TokenStatus.PENDING_PAYMENT,
          issuedBy: request.issuedBy,
          deliveryMode: 'EMAIL_QR',
          emailSent: false,
          emailDeliveryStatus: 'PENDING'
        },
        include: {
          customer: true,
          placeType: true,
          table: true
        }
      });

      if (resolvedTableId) {
        await tx.table.update({
          where: { id: resolvedTableId },
          data: {
            status: 'occupied',
            currentTokenId: token.id,
            occupiedSince: start,
            lastAssignedAt: start
          }
        });
        await tx.tableOccupancyLog.create({
          data: {
            tableId: resolvedTableId,
            tokenId: token.id,
            occupiedAt: start
          }
        });
      }

      // Cache token and customer active status
      await redisService.setex(`token:${tokenNumber}`, 86400, JSON.stringify(token));
      await redisService.setex(
        `customer:active:${request.phoneNumber}`,
        86400,
        JSON.stringify({ tokenId: token.id, tokenNumber })
      );

      if (resolvedTableId) {
        await redisService.del(`table:available:${request.placeTypeId}`);
        await redisService.del('table:available:all');
        await redisService.del(`table:${resolvedTableId}:status`);
      }

      return token;
    });
  }

  async activatePendingSession(
    tokenNumber: string,
    tableNumber: string,
    amountPaid: number,
    activatedBy: string
  ): Promise<any> {
    const now = new Date();
    const activationMethod = ActivationMethod.EMAIL_QR;

    const normalizedTableNumber = tableNumber.trim().replace(/^([SL])(\d{2})$/i, '$1-$2').toUpperCase();

    return await prisma.$transaction(async (tx) => {
      // 1. Lock/fetch the token row
      const tokens = await tx.$queryRaw<any[]>`
        SELECT id, status, "payment_verified" as "paymentVerified", "persons_count" as "personsCount", "place_type_id" as "placeTypeId"
        FROM tokens
        WHERE token_number = ${tokenNumber}
        LIMIT 1
        FOR UPDATE
      `;

      if (!tokens || tokens.length === 0) {
        throw new Error('Token not found.');
      }
      const token = tokens[0];

      if (token.paymentVerified) {
        throw new Error('Token is already activated.');
      }
      if (token.status !== 'PENDING_PAYMENT') {
        if (token.status === 'ACTIVE' || token.status === 'EXTENDED' || token.status === 'EXPIRED') {
          const conflictError = new Error('Session has already been activated.') as any;
          conflictError.code = 'CONFLICT';
          throw conflictError;
        }
        throw new Error(`Token has status '${token.status}' and cannot be activated.`);
      }

      // Check if this customer already has another active session (by phone or email)
      const tokenWithCustomer = await tx.token.findUnique({
        where: { id: token.id },
        include: { customer: true }
      });
      if (!tokenWithCustomer || !tokenWithCustomer.customer) {
        throw new Error('Token customer details not found.');
      }
      
      const customerRecord = tokenWithCustomer.customer;
      const orConditions: any[] = [
        { customer: { phoneNumber: customerRecord.phoneNumber } }
      ];
      if (customerRecord.email && customerRecord.email.trim()) {
        orConditions.push({ customer: { email: customerRecord.email.trim().toLowerCase() } });
      }

      const otherActiveOrPendingToken = await tx.token.findFirst({
        where: {
          id: { not: token.id },
          OR: orConditions,
          status: {
            in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED, TokenStatus.PENDING_PAYMENT, TokenStatus.EXPIRED]
          }
        },
        include: { customer: true }
      });

      if (otherActiveOrPendingToken) {
        const isPending = otherActiveOrPendingToken.status === TokenStatus.PENDING_PAYMENT;
        const msg = isPending
          ? `A pending payment session already exists for this customer (Phone: ${otherActiveOrPendingToken.customer.phoneNumber}, Email: ${otherActiveOrPendingToken.customer.email || 'N/A'}).`
          : `Customer already has an active session (Phone: ${otherActiveOrPendingToken.customer.phoneNumber}, Email: ${otherActiveOrPendingToken.customer.email || 'N/A'}).`;
        throw new Error(msg);
      }

      // 2. Resolve the selected table for the place type of this token
      const table = await tx.table.findFirst({
        where: { tableNumber: normalizedTableNumber, placeTypeId: token.placeTypeId }
      });
      if (!table) {
        throw new Error(`Table '${tableNumber}' not found for this place type.`);
      }
      if (table.status !== 'available' && table.currentTokenId !== token.id) {
        throw new Error(`Table '${tableNumber}' is not available.`);
      }
      if (token.personsCount > table.capacity) {
        throw new Error(`Group size of ${token.personsCount} exceeds table capacity of ${table.capacity}.`);
      }

      // Get place type config
      const ptConfig = await tx.placeTypeConfig.findUnique({
        where: { id: token.placeTypeId }
      });
      if (!ptConfig) {
        throw new Error('Place type config not found.');
      }

      const endTime = new Date(now.getTime() + ptConfig.baseTimeMinutes * 60 * 1000);

      // 3. Update the token
      const updatedToken = await tx.token.update({
        where: { id: token.id },
        data: {
          tableId: table.id,
          amountPaid: amountPaid,
          paymentVerified: true,
          status: TokenStatus.ACTIVE,
          startTime: now,
          endTime,
          activatedAt: now,
          activatedBy: activatedBy,
          activationMethod: activationMethod,
          paymentConfirmedAt: now,
          paymentConfirmedBy: activatedBy
        },
        include: {
          customer: true,
          placeType: true,
          table: true
        }
      });

      // 4. Update table status to occupied
      await tx.table.update({
        where: { id: table.id },
        data: {
          status: 'occupied',
          currentTokenId: token.id,
          occupiedSince: now,
          lastAssignedAt: now
        }
      });

      // 5. Create occupancy log
      await tx.tableOccupancyLog.create({
        data: {
          tableId: table.id,
          tokenId: token.id,
          occupiedAt: now
        }
      });

      // 6. Invalidate caches
      await redisService.del(`table:available:${token.placeTypeId}`);
      await redisService.del('table:available:all');
      await redisService.del(`table:${table.id}:status`);
      await redisService.setex(
        `token:${tokenNumber}`,
        86400,
        JSON.stringify(updatedToken)
      );

      return updatedToken;
    });
  }

  async cancelPendingSession(
    tokenNumber: string,
    cancelledBy: string,
    cancelReason: CancelReason = CancelReason.USER_CANCELLED
  ): Promise<any> {
    const now = new Date();
    return await prisma.$transaction(async (tx) => {
      const token = await tx.token.findUnique({
        where: { tokenNumber }
      });
      if (!token) {
        throw new Error('Token not found.');
      }
      if (token.status !== TokenStatus.PENDING_PAYMENT) {
        throw new Error(`Cannot cancel token with status: ${token.status}`);
      }

      const updatedToken = await tx.token.update({
        where: { id: token.id },
        data: {
          status: TokenStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: cancelledBy,
          cancelReason: cancelReason
        }
      });

      // Invalidate cache
      await redisService.del(`token:${tokenNumber}`);

      return updatedToken;
    });
  }
}

export const tokenService = new TokenService();
export default tokenService;
