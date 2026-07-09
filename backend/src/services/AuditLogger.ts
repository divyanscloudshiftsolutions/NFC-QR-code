import fs from 'fs';
import path from 'path';

export const logStateTransition = (
  tokenNumber: string,
  oldStatus: string,
  newStatus: string,
  reason: string,
  initiatedBy: string
) => {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, 'audit.log');
    const entry = {
      timestamp: new Date().toISOString(),
      tokenNumber,
      oldStatus,
      newStatus,
      reason,
      initiatedBy
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
    console.log(`[AUDIT] Token ${tokenNumber} transitioned from ${oldStatus} to ${newStatus} (${reason}) by ${initiatedBy}`);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
};
