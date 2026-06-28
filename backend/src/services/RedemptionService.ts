import { PrismaClient } from '@prisma/client';
import redisService from './RedisService';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

export interface RedemptionResult {
  success: boolean;
  redemption: any;
  remainingRedemptions: number;
  tokenStatus: string;
}

export class RedemptionService {
  async processRedemption(
    payload: string,
    bartenderId: string,
    redeemedAt?: Date | string,
    presentationType: 'NFC_TAP' | 'QR_SCAN' = 'NFC_TAP'
  ): Promise<RedemptionResult> {
    // 1. Resolve tokenNumber
    let tokenNumber = payload;
    if (presentationType === 'QR_SCAN') {
      try {
        const secret = process.env.GLOBAL_SIGNING_KEY || 'default-global-secret';
        const decoded = jwt.verify(payload, secret) as { token: string; type: string };
        if (decoded.type !== 'EMAIL_QR') {
          throw new Error('Invalid token type in QR code');
        }
        tokenNumber = decoded.token;
      } catch (err: any) {
        throw new Error('Invalid QR payload signature or forgery detected.');
      }
    }

    // Use Redis distributed lock to prevent double redemption
    const lockKey = `lock:redemption:${tokenNumber}`;
    const lockValue = Date.now().toString() + '_' + Math.random().toString();
    const lockAcquired = await redisService.acquireLock(lockKey, lockValue, 10);

    if (!lockAcquired) {
      throw new Error('Another redemption is being processed. Please try again.');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Lock the token row for update
        const tokens = await tx.$queryRaw<any[]>`
          SELECT id, status, end_time as "endTime", redemptions_used as "redemptionsUsed", 
                 total_redemptions_allowed as "totalRedemptionsAllowed", table_id as "tableId",
                 delivery_mode as "deliveryMode"
          FROM tokens
          WHERE token_number = ${tokenNumber}
          FOR UPDATE
        `;

        if (!tokens || tokens.length === 0) {
          throw new Error('Token not found');
        }
        const token = tokens[0];

        // Validate that presentation matches original delivery mode to prevent crossing modes
        if (presentationType === 'QR_SCAN' && token.deliveryMode !== 'EMAIL_QR') {
          throw new Error('NFC token cannot be redeemed via QR scan.');
        }
        if (presentationType === 'NFC_TAP' && token.deliveryMode !== 'NFC_CARD') {
          throw new Error('Email QR token cannot be redeemed via NFC tap.');
        }

        // Validate token status (allow active or extended sessions)
        if (token.status !== 'active' && token.status !== 'extended') {
          throw new Error(`Token is ${token.status}`);
        }

        // Validate expiration
        const now = redeemedAt ? new Date(redeemedAt) : new Date();
        if (now > new Date(token.endTime)) {
          await tx.token.update({
            where: { id: token.id },
            data: { status: 'expired' }
          });
          throw new Error('Token has expired');
        }

        // Check redemption limit
        if (token.redemptionsUsed >= token.totalRedemptionsAllowed) {
          throw new Error('No redemptions remaining');
        }

        // Increment redemption count
        const updatedToken = await tx.token.update({
          where: { id: token.id },
          data: {
            redemptionsUsed: {
              increment: 1
            }
          },
          include: {
            customer: true,
            placeType: true,
            table: true
          }
        });

        // Create redemption record with sequence tracker
        const redemption = await tx.redemption.create({
          data: {
            tokenId: token.id,
            redemptionSequence: updatedToken.redemptionsUsed,
            bartenderId,
            redeemedAt: now
          },
          include: {
            bartender: true
          }
        });

        // Update Redis cache
        await redisService.setex(
          `token:${tokenNumber}`,
          86400,
          JSON.stringify(updatedToken)
        );

        await redisService.hincrby(
          `token:${tokenNumber}:stats`,
          'redemptionsUsed',
          1
        );

        // Invalidate table cache if needed
        if (token.tableId) {
          await redisService.del(`table:${token.tableId}:status`);
        }

        return {
          success: true,
          redemption,
          remainingRedemptions: updatedToken.totalRedemptionsAllowed - updatedToken.redemptionsUsed,
          tokenStatus: updatedToken.status
        };
      });
    } finally {
      // Release distributed lock
      await redisService.releaseLock(lockKey, lockValue);
    }
  }

  async undoRedemption(
    tokenNumber: string
  ): Promise<RedemptionResult> {
    const lockKey = `lock:redemption:${tokenNumber}`;
    const lockValue = Date.now().toString() + '_' + Math.random().toString();
    const lockAcquired = await redisService.acquireLock(lockKey, lockValue, 10);

    if (!lockAcquired) {
      throw new Error('Another redemption is being processed. Please try again.');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // Lock the token row for update
        const tokens = await tx.$queryRaw<any[]>`
          SELECT id, status, end_time as "endTime", redemptions_used as "redemptionsUsed", 
                 total_redemptions_allowed as "totalRedemptionsAllowed", table_id as "tableId"
          FROM tokens
          WHERE token_number = ${tokenNumber}
          FOR UPDATE
        `;

        if (!tokens || tokens.length === 0) {
          throw new Error('Token not found');
        }
        const token = tokens[0];

        // Validate token status
        if (token.status !== 'active' && token.status !== 'extended') {
          throw new Error(`Token is ${token.status}`);
        }

        // Check if there are redemptions to undo
        if (token.redemptionsUsed <= 0) {
          throw new Error('No redemptions to undo');
        }

        // Find the last redemption record for this token
        const lastRedemption = await tx.redemption.findFirst({
          where: { tokenId: token.id },
          orderBy: { redemptionSequence: 'desc' }
        });

        if (!lastRedemption) {
          throw new Error('No redemption record found to undo');
        }

        // Delete the last redemption record
        await tx.redemption.delete({
          where: { id: lastRedemption.id }
        });

        // Decrement redemption count on the token
        const updatedToken = await tx.token.update({
          where: { id: token.id },
          data: {
            redemptionsUsed: {
              decrement: 1
            }
          },
          include: {
            customer: true,
            placeType: true,
            table: true
          }
        });

        // Update Redis cache
        await redisService.setex(
          `token:${tokenNumber}`,
          86400,
          JSON.stringify(updatedToken)
        );

        await redisService.hincrby(
          `token:${tokenNumber}:stats`,
          'redemptionsUsed',
          -1
        );

        // Invalidate table cache if needed
        if (token.tableId) {
          await redisService.del(`table:${token.tableId}:status`);
        }

        return {
          success: true,
          redemption: lastRedemption,
          remainingRedemptions: updatedToken.totalRedemptionsAllowed - updatedToken.redemptionsUsed,
          tokenStatus: updatedToken.status
        };
      });
    } finally {
      // Release distributed lock
      await redisService.releaseLock(lockKey, lockValue);
    }
  }
}

export const redemptionService = new RedemptionService();
export default redemptionService;
