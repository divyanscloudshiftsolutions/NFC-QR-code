import { SessionToken, TokenStatus } from '../types/nfc_bar';

/**
 * Determines if a table session is expiring within the next hour (60 minutes).
 */
export const isTableExpiring = (tableNumber: string, sessions: SessionToken[]): boolean => {
  const session = sessions.find(
    s => s.tableNumber === tableNumber && 
    (s.status === TokenStatus.ACTIVE || s.status === TokenStatus.EXTENDED)
  );
  if (!session) return false;
  const diff = new Date(session.endTime).getTime() - new Date().getTime();
  return diff > 0 && diff < 60 * 60 * 1000; // Less than 1 hour
};
