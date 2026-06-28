import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const apiURL = 'https://notificationservice-virid.vercel.app/api/email/send';

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
    try {
      const tokenRecord = await prisma.token.findUnique({
        where: { tokenNumber }
      });
      if (tokenRecord && tokenRecord.deliveryMode === 'EMAIL_QR') {
        const secret = process.env.GLOBAL_SIGNING_KEY || 'default-global-secret';
        qrData = jwt.sign(
          {
            token: tokenNumber,
            type: 'EMAIL_QR'
          },
          secret
        );
      }
    } catch (e: any) {
      console.warn(`[Email Worker] Failed to check token delivery mode, falling back to token number: ${e.message}`);
    }

    const subject = 'Your Lounge Entry Token QR Code';
    const rawHtml = `
      <h3>Welcome, ${customerName}</h3>
      <p>Your session is active. Please present this QR code to the staff when ordering drinks:</p>
      <div style="margin: 20px 0;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}" alt="QR Code" style="border: 2px solid #F5A623; border-radius: 8px;" />
      </div>
      <p><strong>Token Number:</strong> ${tokenNumber}</p>
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
