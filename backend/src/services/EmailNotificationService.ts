import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const apiURL = process.env.NOTIFICATION_API_URL || 'https://notificationservice-virid.vercel.app/api/email/send';

export interface EmailJob {
  to: string;
  tokenNumber: string;
  customerName: string;
  attemptCount: number;
}

export class EmailNotificationService {
  private static instance: EmailNotificationService;
  private queue: EmailJob[] = [];
  private isProcessing: boolean = false;

  private constructor() {}

  static getInstance(): EmailNotificationService {
    if (!EmailNotificationService.instance) {
      EmailNotificationService.instance = new EmailNotificationService();
    }
    return EmailNotificationService.instance;
  }

  /**
   * Enqueues an email dispatch job in the background (non-blocking)
   */
  enqueueEmailJob(to: string, tokenNumber: string, customerName: string): void {
    const job: EmailJob = {
      to,
      tokenNumber,
      customerName,
      attemptCount: 0
    };
    this.queue.push(job);
    console.info(`[Email Queue] Enqueued email job for ${to} (token: ${tokenNumber})`);
    
    // Trigger queue processing asynchronously
    this.processQueue();
  }

  /**
   * Background worker loop
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;

      try {
        await this.executeJob(job);
      } catch (err: any) {
        console.error(`[Email Worker] Job execution failed: ${err.message}`);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Executes a single email job with validation, HTML sanitization, and retries
   */
  private async executeJob(job: EmailJob): Promise<void> {
    const { to, tokenNumber, customerName } = job;
    
    // 1. Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      await this.logFailure(job, 'INVALID_EMAIL_FORMAT', 'Recipient email format is invalid');
      return;
    }

    // Resolve the token details from database to see delivery mode and sign payload
    let qrData = tokenNumber;
    let personsCount = 1;
    let placeTypeName = 'Standing Bar';
    let tableNumber = 'Pending';
    try {
      const tokenRecord = await prisma.token.findUnique({
        where: { tokenNumber },
        include: {
          customer: true,
          placeType: true,
          table: true
        }
      });
      if (tokenRecord) {
        personsCount = tokenRecord.personsCount;
        placeTypeName = tokenRecord.placeType.name.replace(/_/g, ' ');
        tableNumber = tokenRecord.table ? tokenRecord.table.tableNumber : 'Pending';
        if (tokenRecord.deliveryMode === 'EMAIL_QR') {
          const secret = process.env.GLOBAL_SIGNING_KEY || 'default-global-secret';
          qrData = jwt.sign(
            {
              token: tokenNumber,
              type: 'EMAIL_QR'
            },
            secret
          );
        }
      }
    } catch (e: any) {
      console.warn(`[Email Worker] Failed to check token details, falling back to defaults: ${e.message}`);
    }

    const subject = 'Your Lounge Entry Token QR Code';
    const rawHtml = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #D4AF37; margin-bottom: 20px;">Lounge Entry Confirmation</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.5;">Dear ${customerName || 'Customer'},</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.5;">Welcome to Antigravity Lounge! Your digital check-in session is registered. Please present the QR code below to the staff when ordering drinks or entering the lounge:</p>
        
        <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}" alt="QR Code" style="border: 4px solid #D4AF37; border-radius: 8px; max-width: 250px; height: auto;" />
          <p style="color: #64748b; font-size: 12px; margin-top: 10px; margin-bottom: 0;">Scan to verify entry</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: bold;">Token Number:</td>
            <td style="padding: 10px 0; color: #111827; font-size: 14px; text-align: right; font-family: monospace; font-weight: bold;">${tokenNumber}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: bold;">Seating Area:</td>
            <td style="padding: 10px 0; color: #111827; font-size: 14px; text-align: right;">${placeTypeName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: bold;">Group Size:</td>
            <td style="padding: 10px 0; color: #111827; font-size: 14px; text-align: right;">${personsCount} Person(s)</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 0; color: #64748b; font-size: 14px; font-weight: bold;">Assigned Table:</td>
            <td style="padding: 10px 0; color: #111827; font-size: 14px; text-align: right; font-weight: bold;">${tableNumber}</td>
          </tr>
        </table>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
          <p>Thank you for choosing Antigravity Lounge.</p>
        </div>
      </div>
    `;

    // 2. HTML Sanitization
    const sanitizedHtml = this.sanitizeHtml(rawHtml);
    const bodyText = `Welcome, ${customerName}! Your active session token is ${tokenNumber}.`;

    // 3. API Dispatch with x-api-key authentication
    const apiKey = process.env.NOTIFICATION_API_KEY || '';
    
    try {
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({
          to,
          subject,
          bodyHtml: sanitizedHtml,
          bodyText
        })
      });

      if (response.ok) {
        // Success database updates
        await prisma.token.update({
          where: { tokenNumber },
          data: {
            emailSent: true,
            emailSentAt: new Date(),
            emailDeliveryStatus: 'SENT'
          }
        }).catch(() => {});

        // Success audit log
        await prisma.syncLog.create({
          data: {
            operationId: `EMAIL-SUCCESS-${tokenNumber}-${Date.now()}`,
            deviceId: 'SERVER-NOTIFICATION-WORKER',
            operationType: 'EMAIL_NOTIFICATION',
            payload: { recipient: to, tokenNumber, attemptCount: job.attemptCount, status: 'SUCCESS' },
            status: 'SUCCESS'
          }
        }).catch(() => {});
        console.info(`[Email Worker] Successfully sent email to ${to} for token ${tokenNumber}`);
      } else {
        const errorText = await response.text().catch(() => 'No error response body');
        throw new Error(`Notification service returned ${response.status}: ${errorText}`);
      }
    } catch (err: any) {
      console.warn(`[Email Worker] Attempt ${job.attemptCount + 1} failed: ${err.message}`);
      job.attemptCount += 1;

      if (job.attemptCount < 3) {
        // Exponential backoff delay: 1s, 2s, 4s...
        const delayMs = 1000 * Math.pow(2, job.attemptCount);
        console.info(`[Email Worker] Scheduling retry in ${delayMs}ms...`);
        
        setTimeout(() => {
          this.queue.push(job);
          this.processQueue();
        }, delayMs);
      } else {
        // Final failure database update
        await prisma.token.update({
          where: { tokenNumber },
          data: {
            emailDeliveryStatus: 'FAILED'
          }
        }).catch(() => {});

        // Final failure audit logging
        await this.logFailure(job, 'MAX_RETRIES_EXCEEDED', `Failed to send notification after 3 attempts. Error: ${err.message}`);
      }
    }
  }

  /**
   * Helper to strip dangerous HTML structures (sanitization)
   */
  private sanitizeHtml(html: string): string {
    return html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '') // Strip script blocks
      .replace(/on\w+="[^"]*"/g, '') // Strip inline event handlers
      .replace(/on\w+='[^']*'/g, '')
      .replace(/javascript:[^\s"']*/gi, ''); // Strip javascript URIs
  }

  /**
   * Logs a failed operation in sync_logs table
   */
  private async logFailure(job: EmailJob, errorCode: string, message: string): Promise<void> {
    console.error(`[Email Worker] Final notification failure for ${job.to} (token: ${job.tokenNumber}): ${message}`);
    await prisma.syncLog.create({
      data: {
        operationId: `EMAIL-FAILURE-${job.tokenNumber}-${Date.now()}`,
        deviceId: 'SERVER-NOTIFICATION-WORKER',
        operationType: 'EMAIL_NOTIFICATION',
        payload: { recipient: job.to, tokenNumber: job.tokenNumber, attemptCount: job.attemptCount, status: 'FAILED' },
        status: 'ERROR',
        conflictReason: `${errorCode}: ${message}`
      }
    }).catch(() => {});
  }
}

export const emailNotificationService = EmailNotificationService.getInstance();
export default emailNotificationService;
