import { PrismaClient, AttendanceState } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { FaceService } from './FaceService';

const prisma = new PrismaClient();

export class AttendanceService {
  /**
   * Registers a checkin log for a staff member during login
   */
  public static async checkInEmployee(userId: string, role: string, photoBase64?: string): Promise<{ confidence?: number }> {
    const settings = await this.getSettings();

    // Check duplicate check-ins
    const active = await prisma.attendance.findFirst({
      where: { userId, checkOutTime: null }
    });
    if (active) {
      throw new Error('Already checked in. Please check out before starting a new shift.');
    }

    let confidence: number | undefined;

    if (settings.faceMandatory) {
      if (!photoBase64) {
        throw new Error('Face verification photo is required for this shift.');
      }
      const buffer = Buffer.from(photoBase64, 'base64');
      const embedding = await FaceService.getEmbeddingFromImage(buffer);
      const verification = await FaceService.verifyUserFace(userId, embedding);
      if (!verification.isMatch) {
        throw new Error('Face does not match the entered PIN. Buddy punching detected.');
      }
      confidence = verification.confidence;
    }

    const checkInTime = new Date();
    const metrics = await this.calculateMetrics(checkInTime, null);

    await prisma.attendance.create({
      data: {
        userId,
        role,
        checkInTime,
        primaryState: metrics.primaryState,
        isLate: metrics.isLate,
        loginMethod: settings.faceMandatory ? 'FACE' : 'PIN',
        faceConfidence: confidence || null
      }
    });

    return { confidence };
  }

  /**
   * Registers a checkout log for a staff member during logout
   */
  public static async checkOutEmployee(userId: string, photoBase64?: string): Promise<void> {
    const settings = await this.getSettings();

    const active = await prisma.attendance.findFirst({
      where: { userId, checkOutTime: null }
    });
    if (!active) {
      throw new Error('No active attendance session found to check out.');
    }

    if (settings.faceMandatory) {
      if (!photoBase64) {
        throw new Error('Face verification photo is required to check out.');
      }
      const buffer = Buffer.from(photoBase64, 'base64');
      const embedding = await FaceService.getEmbeddingFromImage(buffer);
      const verification = await FaceService.verifyUserFace(userId, embedding);
      if (!verification.isMatch) {
        throw new Error('Face does not match the active session. Verification failed.');
      }
    }

    const checkOutTime = new Date();
    const metrics = await this.calculateMetrics(active.checkInTime, checkOutTime);

    await prisma.attendance.update({
      where: { id: active.id },
      data: {
        checkOutTime,
        workingHours: metrics.workingHours,
        primaryState: metrics.primaryState,
        isEarlyLeave: metrics.isEarlyLeave,
        isOvertime: metrics.isOvertime,
        logoutMethod: settings.faceMandatory ? 'FACE' : 'PIN'
      }
    });
  }
  /**
   * Helper to fetch configurations with defaults
   */
  public static async getSettings() {
    const keys = [
      'attendance_shift_start',
      'attendance_late_threshold',
      'attendance_shift_end',
      'attendance_early_leave_threshold',
      'attendance_min_half_day_hours',
      'attendance_min_full_day_hours',
      'attendance_min_overtime_hours',
      'face_attendance_mandatory',
      'business_timezone'
    ];

    const configs = await prisma.systemConfig.findMany({
      where: { configKey: { in: keys } }
    });

    const map = new Map(configs.map(c => [c.configKey, c.configValue]));

    return {
      shiftStart: map.get('attendance_shift_start') || '09:00',
      lateThreshold: map.get('attendance_late_threshold') || '09:15',
      shiftEnd: map.get('attendance_shift_end') || '18:00',
      earlyLeaveThreshold: map.get('attendance_early_leave_threshold') || '17:00',
      minHalfDay: parseFloat(map.get('attendance_min_half_day_hours') || '4.0'),
      minFullDay: parseFloat(map.get('attendance_min_full_day_hours') || '8.0'),
      minOvertime: parseFloat(map.get('attendance_min_overtime_hours') || '9.0'),
      faceMandatory: map.get('face_attendance_mandatory') === 'true',
      timezone: map.get('business_timezone') || 'UTC'
    };
  }

  /**
   * Saves settings to SystemConfig
   */
  public static async saveSettings(settings: any) {
    const keys = {
      'attendance_shift_start': settings.shiftStart,
      'attendance_late_threshold': settings.lateThreshold,
      'attendance_shift_end': settings.shiftEnd,
      'attendance_early_leave_threshold': settings.earlyLeaveThreshold,
      'attendance_min_half_day_hours': String(settings.minHalfDay),
      'attendance_min_full_day_hours': String(settings.minFullDay),
      'attendance_min_overtime_hours': String(settings.minOvertime),
      'face_attendance_mandatory': settings.faceMandatory ? 'true' : 'false',
      'business_timezone': settings.timezone || 'UTC'
    };

    for (const [key, value] of Object.entries(keys)) {
      if (value !== undefined) {
        await prisma.systemConfig.upsert({
          where: { configKey: key },
          update: { configValue: value },
          create: { configKey: key, configValue: value }
        });
      }
    }
  }

  /**
   * Calculates checkin/checkout metrics based on rules and configured business timezone
   */
  public static async calculateMetrics(checkIn: Date, checkOut: Date | null) {
    const settings = await this.getSettings();

    let workingHours: number | null = null;
    let primaryState: AttendanceState = AttendanceState.ABSENT;
    let isLate = false;
    let isEarlyLeave = false;
    let isOvertime = false;

    // Timezone Helper: Get time-of-day in business timezone
    const formatTimeOfDay = (date: Date, tz: string): string => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: tz
        });
        return formatter.format(date); // e.g. "09:30"
      } catch (err) {
        // Fallback to UTC if timezone is invalid
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
      }
    };

    // Calculate Late Arrival
    const checkInTimeStr = formatTimeOfDay(checkIn, settings.timezone);
    if (checkInTimeStr > settings.lateThreshold) {
      isLate = true;
    }

    if (checkOut) {
      // Calculate working hours (decimal hours)
      const diffMs = checkOut.getTime() - checkIn.getTime();
      workingHours = diffMs / (1000 * 60 * 60);

      // Determine Primary State
      if (workingHours >= settings.minFullDay) {
        primaryState = AttendanceState.PRESENT;
      } else if (workingHours >= settings.minHalfDay) {
        primaryState = AttendanceState.HALF_DAY;
      } else {
        primaryState = AttendanceState.ABSENT;
      }

      // Calculate Early Leave
      const checkOutTimeStr = formatTimeOfDay(checkOut, settings.timezone);
      if (checkOutTimeStr < settings.earlyLeaveThreshold) {
        isEarlyLeave = true;
      }

      // Calculate Overtime
      if (workingHours >= settings.minOvertime) {
        isOvertime = true;
      }
    } else {
      // Checked in but not yet checked out
      primaryState = AttendanceState.PRESENT; // Default to present until checkout resolves hours
    }

    return {
      workingHours: workingHours !== null ? new Decimal(workingHours.toFixed(2)) : null,
      primaryState,
      isLate,
      isEarlyLeave,
      isOvertime
    };
  }

  /**
   * Generates personal dashboard statistics
   */
  public static async getPersonalStats(userId: string) {
    const logs = await prisma.attendance.findMany({
      where: { userId }
    });

    const presentDays = logs.filter(l => l.primaryState === AttendanceState.PRESENT).length;
    const halfDays = logs.filter(l => l.primaryState === AttendanceState.HALF_DAY).length;
    const absentDays = logs.filter(l => l.primaryState === AttendanceState.ABSENT).length;
    const lateArrivals = logs.filter(l => l.isLate).length;
    const earlyLeaves = logs.filter(l => l.isEarlyLeave).length;
    const overtimeDays = logs.filter(l => l.isOvertime).length;

    let totalWorkingHours = 0;
    let loggedOutCount = 0;

    for (const log of logs) {
      if (log.workingHours) {
        totalWorkingHours += Number(log.workingHours);
        loggedOutCount++;
      }
    }

    const averageWorkingHours = loggedOutCount > 0 ? totalWorkingHours / loggedOutCount : 0;
    
    // Attendance % = (Present + HalfDay * 0.5) / Total Logs * 100
    const totalWorkingDays = logs.length;
    const attendancePercentage = totalWorkingDays > 0 
      ? ((presentDays + (halfDays * 0.5)) / totalWorkingDays) * 100 
      : 0;

    return {
      presentDays,
      absentDays,
      halfDays,
      lateArrivals,
      earlyLeaves,
      overtimeDays,
      totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
      averageWorkingHours: parseFloat(averageWorkingHours.toFixed(2)),
      attendancePercentage: parseFloat(attendancePercentage.toFixed(1))
    };
  }

  /**
   * Generates admin/manager aggregate dashboard statistics
   */
  public static async getAdminSummary() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const logsToday = await prisma.attendance.findMany({
      where: {
        checkInTime: { gte: today }
      }
    });

    const presentToday = logsToday.filter(l => l.primaryState === AttendanceState.PRESENT).length;
    const lateToday = logsToday.filter(l => l.isLate).length;
    const overtimeToday = logsToday.filter(l => l.isOvertime).length;

    const allLogs = await prisma.attendance.findMany();
    let totalWorkingHours = 0;
    let loggedOutCount = 0;

    for (const log of allLogs) {
      if (log.workingHours) {
        totalWorkingHours += Number(log.workingHours);
        loggedOutCount++;
      }
    }

    const avgHoursThisMonth = loggedOutCount > 0 ? totalWorkingHours / loggedOutCount : 0;

    const totalLogs = allLogs.length;
    const totalPresent = allLogs.filter(l => l.primaryState === AttendanceState.PRESENT).length;
    const totalHalf = allLogs.filter(l => l.primaryState === AttendanceState.HALF_DAY).length;
    const companyAttendancePercentage = totalLogs > 0 
      ? ((totalPresent + (totalHalf * 0.5)) / totalLogs) * 100 
      : 0;

    return {
      presentToday,
      lateToday,
      overtimeToday,
      avgHoursThisMonth: parseFloat(avgHoursThisMonth.toFixed(2)),
      companyAttendancePercentage: parseFloat(companyAttendancePercentage.toFixed(1))
    };
  }
}
