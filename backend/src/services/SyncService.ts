import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import tokenService from './TokenService';
import redemptionService from './RedemptionService';
import s3Service from './S3Service';

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

export interface SyncOperation {
  operationId: string;
  operationType: 'CHECK_IN' | 'DRINK_REDEMPTION' | 'DRINK_UNDO' | 'TIME_EXTENSION' | 'SESSION_CLOSE' | 'CARD_STATUS_UPDATE';
  timestamp: string;
  payload: any;
}

export interface SyncResult {
  operationId: string;
  status: 'SUCCESS' | 'CONFLICT' | 'ERROR';
  error?: {
    code: string;
    message: string;
  };
  data?: any;
}

export class SyncService {
  async syncOperations(deviceId: string, operations: SyncOperation[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const op of operations) {
      const { operationId, operationType, timestamp, payload } = op;

      // 1. Idempotency check: look up existing log
      try {
        const existingLog = await prisma.syncLog.findUnique({
          where: { operationId }
        });

        if (existingLog) {
          if (existingLog.status === 'SUCCESS') {
            results.push({
              operationId,
              status: 'SUCCESS',
              data: existingLog.payload
            });
            continue;
          } else if (existingLog.status === 'CONFLICT') {
            results.push({
              operationId,
              status: 'CONFLICT',
              error: {
                code: 'CONFLICT_REPLAY',
                message: existingLog.conflictReason || 'Conflict previously resolved'
              }
            });
            continue;
          }
        }
      } catch (err: any) {
        results.push({
          operationId,
          status: 'ERROR',
          error: { code: 'DB_ERR', message: 'Failed to lookup operation: ' + err.message }
        });
        continue;
      }

      // 2. Process the operation and handle conflict checks
      try {
        const result = await this.processOperation(operationType, payload, timestamp, deviceId, operationId);
        results.push(result);

        // Upload sync log audit record to S3/MinIO (nfc.md compliant)
        try {
          const log = await prisma.syncLog.findUnique({ where: { operationId } });
          if (log) {
            await s3Service.uploadAuditLog('sync-logs', operationId, log);
          }
        } catch (s3Err) {
          console.error('[S3 Audit Log Archiver Error]:', s3Err);
        }
      } catch (err: any) {
        results.push({
          operationId,
          status: 'ERROR',
          error: { code: 'SYSTEM_ERR', message: err.message }
        });
      }
    }

    return results;
  }

  private async processOperation(
    type: string,
    payload: any,
    timestamp: string,
    deviceId: string,
    operationId: string
  ): Promise<SyncResult> {
    const opTime = new Date(timestamp);

    // Resolve token helper (aligned to new current_token_id Card schema relation)
    const resolveTokenNumber = async (tokenNumber?: string, cardUid?: string): Promise<any | null> => {
      if (tokenNumber) {
        return await prisma.token.findUnique({
          where: { tokenNumber },
          include: { customer: true, card: true, table: true }
        });
      }
      if (cardUid) {
        const card = await prisma.card.findUnique({
          where: { nfcUid: cardUid },
          include: { currentToken: { include: { customer: true, card: true, table: true } } }
        });
        if (!card) return null;
        return card.currentToken;
      }
      return null;
    };

    switch (type) {
      case 'CHECK_IN': {
        const {
          phoneNumber,
          customerName,
          email,
          personsCount,
          placeTypeId,
          tableId,
          amountPaid,
          paymentVerified,
          issuedBy,
          nfcCardUid,
          cardId
        } = payload;

        if (payload.placeType && payload.placeType !== 'STANDING_BAR' && payload.placeType !== 'PREMIUM_LOUNGE') {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_PLACE_TYPE_NOT_FOUND', 'Place type must be STANDING_BAR or PREMIUM_LOUNGE');
        }

        let finalPlaceTypeId = placeTypeId;
        let finalTableId = tableId;

        // Resolve place type
        if (!finalPlaceTypeId && payload.placeType) {
          const ptObj = await prisma.placeTypeConfig.findUnique({ where: { name: payload.placeType } });
          if (ptObj) finalPlaceTypeId = ptObj.id;
        }

        if (!finalPlaceTypeId) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_PLACE_TYPE_NOT_FOUND', 'Could not resolve place type');
        }

        // Resolve table
        if (!finalTableId && payload.tableNumber) {
          const tableObj = await prisma.table.findFirst({
            where: { tableNumber: payload.tableNumber, placeTypeId: finalPlaceTypeId }
          });
          if (tableObj) finalTableId = tableObj.id;
        }

        if (!finalTableId) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_TABLE_NOT_FOUND', 'Could not resolve table');
        }

        // Conflict 1: Check active session for customer phone
        const cleanPhone = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;
        
        const existingCustomer = await prisma.customer.findUnique({
          where: { phoneNumber: cleanPhone },
          include: {
            tokens: {
              where: { status: { in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED] } },
              take: 1
            }
          }
        }) as any;

        if (existingCustomer && existingCustomer.tokens.length > 0) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_ACTIVE_SESSION', 'Customer already has an active session');
        }

        // Conflict 2: Check table occupancy
        const table = await prisma.table.findUnique({ where: { id: finalTableId } });
        if (!table) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_TABLE_NOT_FOUND', 'Table not found');
        }
        if (table.status !== 'available') {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_TABLE_OCCUPIED', `Table ${table.tableNumber} is already occupied`);
        }

        // Conflict 3: Check Card assignment
        const card = cardId 
          ? await prisma.card.findUnique({ where: { id: cardId } })
          : await prisma.card.findUnique({ where: { nfcUid: nfcCardUid } });
        if (!card) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_CARD_NOT_FOUND', 'NFC card is not registered');
        }
        if (card.status !== 'available') {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_CARD_ASSIGNED', 'NFC card is already assigned');
        }

        // Conflict 4: Group size vs Table capacity
        if (personsCount > table.capacity) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_CAPACITY_EXCEEDED', `Group size of ${personsCount} exceeds table capacity of ${table.capacity}`);
        }

        // Apply check-in
        const token = await tokenService.createToken({
          phoneNumber: cleanPhone,
          customerName,
          email,
          personsCount,
          placeTypeId: finalPlaceTypeId,
          tableId: finalTableId,
          amountPaid: new Decimal(amountPaid),
          paymentVerified: paymentVerified !== undefined ? paymentVerified : true,
          issuedBy,
          nfcCardUid: nfcCardUid || card.nfcUid,
          cardId: card.id,
          startTime: opTime,
          deliveryMode: (payload as any).deliveryMode
        });

        await prisma.syncLog.create({
          data: {
            operationId,
            deviceId,
            operationType: type,
            payload: { tokenId: token.id, tokenNumber: token.tokenNumber },
            status: 'SUCCESS',
            processedAt: new Date()
          }
        });

        return {
          operationId,
          status: 'SUCCESS',
          data: { tokenId: token.id, tokenNumber: token.tokenNumber }
        };
      }

      case 'DRINK_REDEMPTION': {
        const { tokenNumber, cardUid, bartenderId } = payload;
        
        const token = await resolveTokenNumber(tokenNumber, cardUid);
        if (!token) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_SESSION_NOT_FOUND', 'Session not found');
        }

        // Conflict checks
        if (token.status === TokenStatus.CLOSED) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_SESSION_CLOSED', 'Session is already closed');
        }

        if (opTime > new Date(token.endTime)) {
          // Update token status to expired dynamically
          await prisma.token.update({
            where: { id: token.id },
            data: { status: TokenStatus.EXPIRED }
          });
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_SESSION_EXPIRED', 'Session expired before redemption');
        }

        if (token.redemptionsUsed >= token.totalRedemptionsAllowed) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_LIMIT_EXCEEDED', 'Drink limit fully reached');
        }

        // Apply redemption
        const presentationType = token.deliveryMode === 'EMAIL_QR' ? 'QR_SCAN' : 'NFC_TAP';
        const result = await redemptionService.processRedemption(token.tokenNumber, bartenderId, opTime, presentationType);

        await prisma.syncLog.create({
          data: {
            operationId,
            deviceId,
            operationType: type,
            payload: { remaining: result.remainingRedemptions },
            status: 'SUCCESS',
            processedAt: new Date()
          }
        });

        return {
          operationId,
          status: 'SUCCESS',
          data: { remaining: result.remainingRedemptions }
        };
      }

      case 'DRINK_UNDO': {
        const { tokenNumber, cardUid } = payload;

        const token = await resolveTokenNumber(tokenNumber, cardUid);
        if (!token) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_SESSION_NOT_FOUND', 'Session not found');
        }

        if (token.redemptionsUsed <= 0) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_NO_REDEMPTIONS', 'No redemptions to undo');
        }

        const result = await redemptionService.undoRedemption(token.tokenNumber);

        await prisma.syncLog.create({
          data: {
            operationId,
            deviceId,
            operationType: type,
            payload: { remaining: result.remainingRedemptions },
            status: 'SUCCESS',
            processedAt: new Date()
          }
        });

        return {
          operationId,
          status: 'SUCCESS',
          data: { remaining: result.remainingRedemptions }
        };
      }

      case 'TIME_EXTENSION': {
        const { tokenNumber, cardUid, extraMinutes, additionalAmount, approvedBy, additionalPersons } = payload;

        const token = await resolveTokenNumber(tokenNumber, cardUid);
        if (!token) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_SESSION_NOT_FOUND', 'Session not found');
        }

        if (token.status === TokenStatus.CLOSED) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_SESSION_CLOSED', 'Session is already closed');
        }

        const updated = await tokenService.extendToken(
          token.tokenNumber,
          extraMinutes,
          additionalAmount,
          approvedBy,
          additionalPersons
        );

        await prisma.syncLog.create({
          data: {
            operationId,
            deviceId,
            operationType: type,
            payload: { newEndTime: updated.endTime },
            status: 'SUCCESS',
            processedAt: new Date()
          }
        });

        return {
          operationId,
          status: 'SUCCESS',
          data: { newEndTime: updated.endTime }
        };
      }

      case 'SESSION_CLOSE': {
        const { tokenNumber, cardUid, closedBy, eraseCard } = payload;

        const token = await resolveTokenNumber(tokenNumber, cardUid);
        if (!token) {
          return await this.logConflict(operationId, deviceId, type, payload, 'CONFLICT_SESSION_NOT_FOUND', 'Session not found');
        }

        if (token.status === TokenStatus.CLOSED) {
          // Already closed - return success (idempotent checkout)
          return {
            operationId,
            status: 'SUCCESS',
            data: { message: 'Session already closed' }
          };
        }

        const summary = await tokenService.closeToken(
          token.tokenNumber,
          closedBy,
          eraseCard !== undefined ? eraseCard : true
        );

        await prisma.syncLog.create({
          data: {
            operationId,
            deviceId,
            operationType: type,
            payload: { closedAt: summary.token.closedAt },
            status: 'SUCCESS',
            processedAt: new Date()
          }
        });

        return {
          operationId,
          status: 'SUCCESS',
          data: { closedAt: summary.token.closedAt }
        };
      }

      case 'CARD_STATUS_UPDATE': {
        const { cardUid, status } = payload;

        return await prisma.$transaction(async (tx) => {
          const card = await tx.card.findUnique({ where: { nfcUid: cardUid } });
          if (!card) {
            throw new Error('Card not found');
          }

          const updatedCard = await tx.card.update({
            where: { nfcUid: cardUid },
            data: { status: status.toLowerCase() }
          });

          await tx.syncLog.create({
            data: {
              operationId,
              deviceId,
              operationType: type,
              payload: { status: updatedCard.status },
              status: 'SUCCESS',
              processedAt: new Date()
            }
          });

          return {
            operationId,
            status: 'SUCCESS',
            data: { status: updatedCard.status }
          };
        });
      }

      default:
        throw new Error('Unknown operation type: ' + type);
    }
  }

  private async logConflict(
    operationId: string,
    deviceId: string,
    type: string,
    payload: any,
    code: string,
    message: string
  ): Promise<SyncResult> {
    await prisma.syncLog.create({
      data: {
        operationId,
        deviceId,
        operationType: type,
        payload,
        status: 'CONFLICT',
        conflictReason: `${code}: ${message}`,
        processedAt: new Date()
      }
    });

    return {
      operationId,
      status: 'CONFLICT',
      error: { code, message }
    };
  }
}

export const syncService = new SyncService();
export default syncService;
