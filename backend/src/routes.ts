import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient, CloseReason, ActivationMethod, CancelReason } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { tableService } from './services/TableService';
import { tokenService } from './services/TokenService';
import { redemptionService } from './services/RedemptionService';
import redisService from './services/RedisService';
import bcrypt from 'bcrypt';
import syncService from './services/SyncService';

const TokenStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT' as const,
  ACTIVE: 'ACTIVE' as const,
  CLOSED: 'CLOSED' as const,
  CANCELLED: 'CANCELLED' as const,
  EXPIRED: 'EXPIRED' as const,
  EXTENDED: 'EXTENDED' as const,
};
type TokenStatus = (typeof TokenStatus)[keyof typeof TokenStatus];
import s3Service from './services/S3Service';
import emailNotificationService from './services/EmailNotificationService';

const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET || 'nfc_bar_super_secret_key_123!';
const authApiUrl = process.env.AUTH_API_URL || 'https://authapi.cloudshiftsolutions.in';
const configuredTenantId = process.env.TENANT_ID;
const configuredTenantCode = process.env.TENANT_CODE;

const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 2000): Promise<any> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal as any
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const isValidUUID = (uuid: string): boolean => {
  if (!uuid) return false;
  return UUID_REGEX.test(uuid);
};

export const validateEmail = (value?: string | null): boolean => {
  if (!value || !value.trim()) return true;

  const email = value.trim().toLowerCase();

  const regex = /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9]+(\.[a-z0-9]+)*@gmail\.com$/;

  return regex.test(email);
};

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string; // e.g. "admin", "receptionist", "bartender", "manager"
    fullName: string;
  };
}

// ==========================================
// MIDDLEWARES
// ==========================================

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      // 1. Try local session lookup
      const session = await prisma.staffSession.findFirst({
        where: {
          id: token,
          expiresAt: { gt: new Date() }
        },
        include: {
          user: {
            include: { role: true }
          }
        }
      });

      if (session && session.user && session.user.isActive) {
        req.user = {
          id: session.user.id,
          username: session.user.username,
          role: session.user.role.name,
          fullName: session.user.fullName
        };
        return next();
      }
    } catch (dbErr) {
      console.warn(`Local session DB lookup failed: ${dbErr}`);
    }

    // 2. Fallback to external validation (e.g. federated auth api validation)
    try {
      const validateRes = await fetchWithTimeout(`${authApiUrl}/api/auth/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }, 2000);

      if (validateRes.ok) {
        const data = await validateRes.json();
        if (data && data.valid && data.sub) {
          const localUser = await prisma.user.findFirst({
            where: {
              OR: [
                { id: data.sub },
                { username: data.email ? data.email.split('@')[0] : undefined }
              ]
            },
            include: { role: true }
          });

          if (localUser && localUser.isActive) {
            req.user = {
              id: localUser.id,
              username: localUser.username,
              role: localUser.role.name,
              fullName: localUser.fullName
            };
            return next();
          }
        }
      }
    } catch (extErr: any) {
      console.warn(`External token validation failed/timed out: ${extErr.message}`);
    }

    return res.status(403).json({ success: false, error: { code: 'AUTH_002', message: 'Invalid or expired token' } });
  } else {
    res.status(401).json({ success: false, error: { code: 'AUTH_003', message: 'Authorization header missing' } });
  }
};

export const authorize = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'AUTH_004', message: 'Access denied: insufficient permissions' } });
    }
    next();
  };
};

const router = Router();

router.get('/debug-prisma-enums', (req: Request, res: Response) => {
  try {
    const { TokenStatus: originalTokenStatus } = require('@prisma/client');
    return res.json({
      success: true,
      debugMessage: 'Prisma Client verification info',
      importedTokenStatus: originalTokenStatus,
      codebaseTokenStatus: TokenStatus,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.split('@')[1].split('/')[0]}` : 'not-set',
        PORT: process.env.PORT || 'default-4000',
        NODE_ENV: process.env.NODE_ENV || 'not-set'
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Login
router.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: { code: 'VAL_001', message: 'Username and password are required' } });
  }

  const email = username;
  let externalSuccess = false;
  let externalUser: any = null;

  try {
    const response = await fetchWithTimeout(`${authApiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, tenant_code: 'cloud-shift-solutions' })
    }, 2000);

    if (response.ok) {
      const data = await response.json();
      if (data && data.user) {
        externalUser = data.user;
        externalSuccess = true;
      }
    } else {
      console.warn(`External Auth API login failed with status ${response.status}`);
    }
  } catch (err: any) {
    console.warn(`External Auth API connection failed: ${err.message}. Falling back to local authentication.`);
  }

  if (externalSuccess && externalUser) {
    if (configuredTenantId || configuredTenantCode) {
      const externalTenant = externalUser.tenant;
      if (!externalTenant) {
        return res.status(403).json({
          success: false,
          error: { code: 'AUTH_009', message: 'Access Denied: User tenant is missing' }
        });
      }

      const tenantIdMatches = !configuredTenantId || externalTenant.id === configuredTenantId;
      const tenantCodeMatches = !configuredTenantCode || externalTenant.code === configuredTenantCode;

      if (!tenantIdMatches || !tenantCodeMatches) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTH_009',
            message: `Access Denied: User belongs to tenant '${externalTenant.code || externalTenant.id}', but this system is configured for tenant '${configuredTenantCode || configuredTenantId}'`
          }
        });
      }
    }

    let externalRole: string | undefined;
    if (externalUser.apps && typeof externalUser.apps === 'object') {
      for (const appKey of Object.keys(externalUser.apps)) {
        const appAccess = externalUser.apps[appKey];
        if (appAccess && typeof appAccess.role === 'string') {
          const roleLower = appAccess.role.toLowerCase();
          if (['admin', 'receptionist', 'bartender', 'manager'].includes(roleLower)) {
            externalRole = roleLower;
            break;
          }
        }
      }
    }

    if (!externalRole) {
      const localUsername = username.includes('@') ? username.split('@')[0] : username;
      const localUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: localUsername },
            { username: username }
          ]
        },
        include: { role: true }
      });

      if (localUser && localUser.isActive) {
        externalRole = localUser.role.name;
      } else {
        return res.status(403).json({
          success: false,
          error: { code: 'AUTH_006', message: 'Access Denied: User is not authorized for the NFC Bar application' }
        });
      }
    }

    try {
      const localUsername = username.includes('@') ? username.split('@')[0] : username;
      const finalUser = await prisma.$transaction(async (tx) => {
        const roleObj = await tx.role.findFirst({
          where: { name: { equals: externalRole, mode: 'insensitive' } }
        });
        if (!roleObj) {
          throw new Error(`Role ${externalRole} not configured in local database`);
        }

        const existingUser = await tx.user.findFirst({
          where: {
            OR: [
              { username: localUsername },
              { username: username }
            ]
          }
        });

        if (existingUser) {
          return await tx.user.update({
            where: { id: existingUser.id },
            data: {
              fullName: externalUser.full_name || existingUser.fullName,
              roleId: roleObj.id,
              isActive: true,
              lastLogin: new Date()
            },
            include: { role: true }
          });
        } else {
          return await tx.user.create({
            data: {
              username: localUsername,
              fullName: externalUser.full_name || localUsername,
              passwordHash: '', 
              roleId: roleObj.id,
              isActive: true,
              lastLogin: new Date()
            },
            include: { role: true }
          });
        }
      });

      await prisma.syncLog.create({
        data: {
          operationId: `LOGIN-SYNC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          deviceId: 'SERVER-API',
          operationType: 'FEDERATED_LOGIN_SUCCESS',
          payload: { username, email, role: externalRole },
          status: 'SUCCESS'
        }
      }).catch(() => {});

      const session = await prisma.staffSession.create({
        data: {
          userId: finalUser.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
      });

      return res.json({
        success: true,
        token: session.id,
        accessToken: session.id,
        refreshToken: 'no-jwt-refresh-needed',
        user: {
          id: finalUser.id,
          username: finalUser.username,
          fullName: finalUser.fullName,
          name: finalUser.fullName,
          role: finalUser.role.name.toUpperCase(),
          roleDetail: {
            id: finalUser.role.id,
            name: finalUser.role.name,
            permissions: finalUser.role.permissions,
          },
        },
        message: 'Login successful (Federated)',
      });
    } catch (dbErr: any) {
      console.error('Database transaction sync failed:', dbErr);
      await prisma.syncLog.create({
        data: {
          operationId: `LOGIN-SYNC-FAIL-${Date.now()}`,
          deviceId: 'SERVER-API',
          operationType: 'FEDERATED_LOGIN_FAIL',
          payload: { username, error: dbErr.message },
          status: 'ERROR',
          conflictReason: dbErr.message
        }
      }).catch(() => {});
      return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: dbErr.message } });
    }
  }

  const usernameLower = username.toLowerCase();
  const isLocalAllowed = 
    ['admin', 'receptionist', 'bartender', 'manager'].includes(usernameLower) ||
    /^(adm|rec|bar|mgr)-\d{2}$/.test(usernameLower);

  if (!isLocalAllowed) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_001', message: 'Invalid username or password (Federated authentication failed)' }
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });

    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, error: { code: 'AUTH_001', message: 'Invalid username or password' } });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: { code: 'AUTH_005', message: 'User account is deactivated' } });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    await prisma.syncLog.create({
      data: {
        operationId: `LOGIN-FALLBACK-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        deviceId: 'SERVER-API',
        operationType: 'LOCAL_FALLBACK_LOGIN',
        payload: { username },
        status: 'SUCCESS'
      }
    }).catch(() => {});

    const session = await prisma.staffSession.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    return res.json({
      success: true,
      token: session.id,
      accessToken: session.id,
      refreshToken: 'no-jwt-refresh-needed',
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        name: user.fullName,
        role: user.role.name.toUpperCase(),
        roleDetail: {
          id: user.role.id,
          name: user.role.name,
          permissions: user.role.permissions,
        },
      },
      message: 'Login successful (Local fallback)',
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// Logout User (Authenticated)
router.post('/auth/logout', authenticate, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      await prisma.staffSession.delete({
        where: { id: token }
      });
    } catch (err) {
      console.warn(`Logout: Session deletion failed (it might have already been deleted): ${err}`);
    }
  }
  return res.json({ success: true, message: 'Logged out successfully' });
});

// Register User (Admin Only)
router.post('/auth/register', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { username, password, fullName, name, role, roleName } = req.body;
  
  const finalUsername = username;
  const finalPassword = password;
  const finalFullName = fullName || name;
  const finalRoleName = (roleName || role || 'receptionist').toLowerCase();

  if (!finalUsername || !finalPassword || !finalFullName) {
    return res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'All fields are required' } });
  }

  const nameRegex = /^[a-zA-Z\s.'-]{2,100}$/;
  if (!nameRegex.test(finalFullName)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VAL_ERR',
        message: 'Full name must contain only letters, spaces, periods, apostrophes, or hyphens (2-100 characters).'
      }
    });
  }

  const allowedSeeded = ['admin', 'receptionist', 'bartender', 'manager'];
  if (!allowedSeeded.includes(finalUsername.toLowerCase())) {
    let prefixRegex: RegExp;
    let expectedFormat: string;
    if (finalRoleName === 'admin') {
      prefixRegex = /^ADM-\d{2}$/;
      expectedFormat = 'ADM-XX';
    } else if (finalRoleName === 'receptionist') {
      prefixRegex = /^REC-\d{2}$/;
      expectedFormat = 'REC-XX';
    } else if (finalRoleName === 'bartender') {
      prefixRegex = /^BAR-\d{2}$/;
      expectedFormat = 'BAR-XX';
    } else if (finalRoleName === 'manager') {
      prefixRegex = /^MGR-\d{2}$/;
      expectedFormat = 'MGR-XX';
    } else {
      return res.status(400).json({ success: false, error: { code: 'VAL_004', message: 'Role does not exist' } });
    }

    if (!prefixRegex.test(finalUsername)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_ERR',
          message: `Username must match the role format ${expectedFormat} (e.g., ${expectedFormat.replace('XX', '01')})`
        }
      });
    }
  }

  const pinRegex = /^\d{4}$/;
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,100}$/;
  if (!pinRegex.test(finalPassword) && !passwordRegex.test(finalPassword)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VAL_ERR',
        message: 'Password must be either a 4-digit PIN or a strong password (8-100 characters with uppercase, lowercase, digit, and special character).'
      }
    });
  }

  const roleObj = await prisma.role.findFirst({
    where: {
      name: { equals: finalRoleName, mode: 'insensitive' }
    }
  });

  if (!roleObj) {
    return res.status(400).json({ success: false, error: { code: 'VAL_004', message: 'Role does not exist' } });
  }

  let signupSucceeded = false;
  let createdExternalId: string | null = null;
  const email = finalUsername.includes('@') ? finalUsername : `${finalUsername.toLowerCase()}@cloudshiftsolutions.in`;

  let signupTenantId: string | null = null;
  try {
    const signupRes = await fetchWithTimeout(`${authApiUrl}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password: finalPassword,
        full_name: finalFullName,
        tenant_code: 'cloud-shift-solutions'
      })
    }, 2000);

    if (signupRes.ok) {
      signupSucceeded = true;
      const data = await signupRes.json().catch(() => ({}));
      if (data && data.user && data.user.id) {
        createdExternalId = data.user.id;
      }
      if (data && data.tenant && data.tenant.id) {
        signupTenantId = data.tenant.id;
      }
    } else {
      const errorText = await signupRes.text().catch(() => 'Signup request failed');
      if (signupRes.status === 409 || (signupRes.status === 400 && errorText.includes('already exists'))) {
        signupSucceeded = true;
      } else {
        return res.status(500).json({
          success: false,
          error: { code: 'AUTH_007', message: `External registration failed with status ${signupRes.status}: ${errorText}` }
        });
      }
    }
  } catch (err: any) {
    const isUnreachable = 
      err.code === 'ECONNREFUSED' || 
      err.code === 'ENOTFOUND' || 
      err.code === 'ETIMEDOUT' || 
      err.name === 'AbortError' ||
      err.message.includes('fetch failed');

    if (isUnreachable || process.env.NODE_ENV === 'test') {
      console.warn(`External registration service is unreachable (${err.message}). Performing local-only registration.`);
      signupSucceeded = true;
    } else {
      console.error('External registration request failed:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'AUTH_008', message: `External registration service is unavailable: ${err.message}` }
      });
    }
  }

  try {
    const newUser = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { username: finalUsername } });
      if (existing) {
        throw new Error('Username is already taken');
      }

      const hashedPassword = await bcrypt.hash(finalPassword, 12);
      return await tx.user.create({
        data: {
          username: finalUsername,
          passwordHash: hashedPassword,
          fullName: finalFullName,
          roleId: roleObj.id,
          isActive: true,
        },
        include: { role: true },
      });
    });

    await prisma.syncLog.create({
      data: {
        operationId: `REG-SYNC-${Date.now()}`,
        deviceId: 'SERVER-API',
        operationType: 'EXTERNAL_REGISTRATION_SUCCESS',
        payload: { username: finalUsername, email },
        status: 'SUCCESS'
      }
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        name: newUser.fullName,
        role: newUser.role.name.toUpperCase(),
      }
    });
  } catch (dbErr: any) {
    console.error('Local DB transaction failed for registration:', dbErr);
    
    if (signupSucceeded && createdExternalId) {
      try {
        console.warn(`[CRITICAL_SYNC_INCONSISTENCY] Local user database registration failed, but user was created on external Auth API with ID: ${createdExternalId}. Database Error: ${dbErr.message}`);
        
        const tenantId = signupTenantId || '2811fefd-f80d-47a3-b13a-c6ff576289be';
        const cleanupRes = await fetchWithTimeout(`${authApiUrl}/api/tenants/${tenantId}/users/${createdExternalId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        }, 2000).catch(() => null);

        if (cleanupRes && cleanupRes.ok) {
          console.info(`Successfully cleaned up orphaned external user ${createdExternalId}`);
        } else {
          console.error(`[CRITICAL_SYNC_INCONSISTENCY] Failed to clean up orphaned external user ${createdExternalId} via API.`);
        }
      } catch (cleanupErr: any) {
        console.error('[CRITICAL_SYNC_INCONSISTENCY] Failed to run compensating transaction for external user cleanup:', cleanupErr);
      }
    }

    await prisma.syncLog.create({
      data: {
        operationId: `REG-SYNC-FAIL-${Date.now()}`,
        deviceId: 'SERVER-API',
        operationType: 'EXTERNAL_REGISTRATION_FAIL',
        payload: { username: finalUsername, error: dbErr.message },
        status: 'ERROR',
        conflictReason: dbErr.message
      }
    }).catch(() => {});

    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: dbErr.message } });
  }
});

// Get Me
router.get('/auth/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_003', message: 'Unauthorized' } });
  }
  // format user for old/new client compatibility
  return res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      name: req.user.fullName,
      role: req.user.role.toUpperCase(),
    }
  });
});

// GET /api/users (Admin Only)
router.get('/users', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      include: { role: true },
      orderBy: { username: 'asc' }
    });
    const formattedUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      isActive: u.isActive,
      roleId: u.roleId,
      role: {
        id: u.role.id,
        name: u.role.name,
        permissions: u.role.permissions
      },
      createdAt: u.createdAt,
      lastLogin: u.lastLogin
    }));
    return res.json({ success: true, data: formattedUsers });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// PUT /api/users/:id (Admin Only)
router.put('/users/:id', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, fullName, role, roleName, isActive, password } = req.body;
  const authUser = (req as AuthenticatedRequest).user;

  if (!authUser) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_003', message: 'Unauthorized' } });
  }

  const finalFullName = fullName;
  const finalUsername = username;
  const finalRoleName = (roleName || role || '').toLowerCase();

  if (!finalUsername || !finalFullName || !finalRoleName) {
    return res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'Username, Full Name, and Role are required' } });
  }

  const nameRegex = /^[a-zA-Z\s.'-]{2,100}$/;
  if (!nameRegex.test(finalFullName)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VAL_ERR',
        message: 'Full name must contain only letters, spaces, periods, apostrophes, or hyphens (2-100 characters).'
      }
    });
  }

  const allowedSeeded = ['admin', 'receptionist', 'bartender', 'manager'];
  if (!allowedSeeded.includes(finalUsername.toLowerCase())) {
    let prefixRegex: RegExp;
    let expectedFormat: string;
    if (finalRoleName === 'admin') {
      prefixRegex = /^ADM-\d{2}$/;
      expectedFormat = 'ADM-XX';
    } else if (finalRoleName === 'receptionist') {
      prefixRegex = /^REC-\d{2}$/;
      expectedFormat = 'REC-XX';
    } else if (finalRoleName === 'bartender') {
      prefixRegex = /^BAR-\d{2}$/;
      expectedFormat = 'BAR-XX';
    } else if (finalRoleName === 'manager') {
      prefixRegex = /^MGR-\d{2}$/;
      expectedFormat = 'MGR-XX';
    } else {
      return res.status(400).json({ success: false, error: { code: 'VAL_004', message: 'Role does not exist' } });
    }

    if (!prefixRegex.test(finalUsername)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_ERR',
          message: `Username must match the role format ${expectedFormat} (e.g., ${expectedFormat.replace('XX', '01')})`
        }
      });
    }
  }

  if (password) {
    const pinRegex = /^\d{4}$/;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,100}$/;
    if (!pinRegex.test(password) && !passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VAL_ERR',
          message: 'Password must be either a 4-digit PIN or a strong password (8-100 characters with uppercase, lowercase, digit, and special character).'
        }
      });
    }
  }

  if (authUser.id === id && isActive === false) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CONFLICT_SELF_DEACTIVATION',
        message: 'You cannot deactivate your own account.'
      }
    });
  }

  try {
    const userBefore = await prisma.user.findUnique({
      where: { id },
      include: { role: true }
    });

    if (!userBefore) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    if (finalUsername !== userBefore.username) {
      const existing = await prisma.user.findUnique({ where: { username: finalUsername } });
      if (existing) {
        return res.status(400).json({ success: false, error: { code: 'VAL_003', message: 'Username is already taken' } });
      }
    }

    const roleObj = await prisma.role.findFirst({
      where: { name: { equals: finalRoleName, mode: 'insensitive' } }
    });

    if (!roleObj) {
      return res.status(400).json({ success: false, error: { code: 'VAL_004', message: 'Role does not exist' } });
    }

    const updateData: any = {
      username: finalUsername,
      fullName: finalFullName,
      roleId: roleObj.id,
      isActive: isActive !== undefined ? isActive : userBefore.isActive
    };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    let createdRoleLog: any = null;

    const updatedUser = await prisma.$transaction(async (tx) => {
      if (userBefore.role.name.toLowerCase() !== roleObj.name.toLowerCase()) {
        createdRoleLog = await tx.roleChangeLog.create({
          data: {
            targetUserId: id,
            changedBy: authUser.id,
            oldRole: userBefore.role.name,
            newRole: roleObj.name
          }
        });
      }

      return await tx.user.update({
        where: { id },
        data: updateData,
        include: { role: true }
      });
    });

    if (createdRoleLog) {
      try {
        await s3Service.uploadAuditLog('role-changes', createdRoleLog.id, createdRoleLog);
      } catch (s3Err) {
        console.error('[S3 Role Change Log Archiver Error]:', s3Err);
      }
    }

    return res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        fullName: updatedUser.fullName,
        isActive: updatedUser.isActive,
        role: updatedUser.role.name.toUpperCase()
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// PATCH /api/users/:id/status (Admin Only)
router.patch('/users/:id/status', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isActive } = req.body;
  const authUser = (req as AuthenticatedRequest).user;

  if (!authUser) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_003', message: 'Unauthorized' } });
  }

  if (isActive === undefined) {
    return res.status(400).json({ success: false, error: { code: 'VAL_002', message: 'isActive status is required' } });
  }

  if (authUser.id === id && isActive === false) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CONFLICT_SELF_DEACTIVATION',
        message: 'You cannot deactivate your own account.'
      }
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive },
      include: { role: true }
    });

    return res.json({
      success: true,
      message: 'User status updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        fullName: updatedUser.fullName,
        isActive: updatedUser.isActive,
        role: updatedUser.role.name.toUpperCase()
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// ==========================================
// 2. TABLE MANAGEMENT ENDPOINTS
// ==========================================

// Get all tables
router.get('/tables', authenticate, async (req: Request, res: Response) => {
  try {
    await tokenService.reconcileSystemState();
    const tables = await prisma.table.findMany({
      include: { placeType: true },
      orderBy: { tableNumber: 'asc' },
    });
    
    // Map response keys for old client compatibility (e.g. number and placeType mapping)
    const oldTables = tables.map(t => ({
      id: t.id,
      number: t.tableNumber,
      placeType: t.placeType.name,
      placeTypeId: t.placeTypeId,
      capacity: t.capacity,
      status: t.status.toUpperCase(),
      isActive: t.isActive,
    }));

    return res.json(oldTables);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// Get available tables
router.get('/tables/available', authenticate, async (req: Request, res: Response) => {
  const { placeTypeId, placeType } = req.query;
  try {
    await tokenService.reconcileSystemState();
    let finalPlaceTypeId = placeTypeId as string;
    
    // If client sent placeType string (e.g. "PREMIUM_LOUNGE"), resolve UUID
    if (placeType && placeType !== 'STANDING_BAR' && placeType !== 'PREMIUM_LOUNGE') {
      return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Place type must be either STANDING_BAR or PREMIUM_LOUNGE.' } });
    }
    if (!finalPlaceTypeId && placeType) {
      const config = await prisma.placeTypeConfig.findUnique({
        where: { name: placeType as string }
      });
      if (config) finalPlaceTypeId = config.id;
    }

    const tables = await tableService.getAvailableTables(finalPlaceTypeId);
    
    // Map response for compatibility
    const oldTables = tables.map(t => ({
      id: t.id,
      number: t.tableNumber,
      placeType: t.placeType.name,
      capacity: t.capacity,
      status: t.status.toUpperCase(),
    }));

    return res.json(oldTables);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// Get occupancy
router.get('/tables/occupancy', authenticate, async (req: Request, res: Response) => {
  try {
    await tokenService.reconcileSystemState();
    const report = await tableService.getTableOccupancy();
    return res.json({
      success: true,
      data: report,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// Assign Table
router.post('/tables/assign', authenticate, authorize(['receptionist', 'admin']), async (req: Request, res: Response) => {
  const { tableId, tokenId } = req.body;
  if (!tableId || !tokenId) {
    return res.status(400).json({ success: false, error: { code: 'VAL_005', message: 'tableId and tokenId are required' } });
  }
  if (!isValidUUID(tableId) || !isValidUUID(tokenId)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid tableId or tokenId UUID format.' } });
  }

  try {
    const table = await tableService.assignTableToToken(tableId, tokenId);
    const token = await prisma.token.findUnique({
      where: { id: tokenId },
      include: { customer: true }
    });
    if (token && token.status === TokenStatus.PENDING_PAYMENT && token.deliveryMode === 'EMAIL_QR') {
      emailNotificationService.enqueueEmailJob(token.customer.email!, token.tokenNumber, token.customer.name);
      await prisma.token.update({
        where: { id: tokenId },
        data: {
          emailSent: true,
          emailSentAt: new Date(),
          emailDeliveryStatus: 'SENT'
        }
      });
    }
    return res.json({
      success: true,
      data: {
        table: {
          id: table.id,
          tableNumber: table.tableNumber,
          status: table.status,
          occupiedSince: table.occupiedSince,
        },
        token: {
          id: token?.id,
          tokenNumber: token?.tokenNumber,
        },
      },
      message: 'Table assigned successfully',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { code: 'ASSIGN_ERR', message: err.message } });
  }
});

// Release Table
router.put('/tables/:tableId/release', authenticate, authorize(['receptionist', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { tableId } = req.params;
  const { tokenId } = req.body;
  if (!tokenId) {
    return res.status(400).json({ success: false, error: { code: 'VAL_006', message: 'tokenId is required' } });
  }
  if (!isValidUUID(tableId) || !isValidUUID(tokenId)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid tableId or tokenId UUID format.' } });
  }

  try {
    const table = await tableService.releaseTable(tableId, tokenId);
    
    // Find duration if logged
    const logs = await prisma.tableOccupancyLog.findMany({
      where: { tableId, tokenId },
      orderBy: { occupiedAt: 'desc' },
      take: 1
    });
    const log = logs[0];
    let occupancyDurationMinutes = 0;
    if (log && log.vacatedAt) {
      occupancyDurationMinutes = Math.floor((new Date(log.vacatedAt).getTime() - new Date(log.occupiedAt).getTime()) / 60000);
    }

    return res.json({
      success: true,
      data: {
        tableId: table.id,
        tableNumber: table.tableNumber,
        status: table.status,
        occupancyDurationMinutes,
      },
      message: 'Table released successfully',
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { code: 'RELEASE_ERR', message: err.message } });
  }
});

// Create Table (Admin Only)
router.post('/tables', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { tableNumber, number, placeTypeId, placeType, capacity, isActive } = req.body;
  
  const finalTableNumber = tableNumber || number;
  let finalPlaceTypeId = placeTypeId;

  if (!finalTableNumber) {
    return res.status(400).json({ success: false, error: { code: 'VAL_007', message: 'Table number is required' } });
  }

  const tableNumRegex = /^(S|L)-\d{2}$/;
  if (!tableNumRegex.test(finalTableNumber)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Table number must match prefix and 2-digit format (S-01 to S-15, L-01 to L-10) and have length 4.' } });
  }

  const finalCapacity = capacity ? parseInt(capacity, 10) : 2;
  if (isNaN(finalCapacity) || finalCapacity < 1 || finalCapacity > 100) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Table capacity must be between 1 and 100.' } });
  }

  try {
    if (!finalPlaceTypeId && placeType) {
      const ptObj = await prisma.placeTypeConfig.findUnique({
        where: { name: placeType }
      });
      if (ptObj) finalPlaceTypeId = ptObj.id;
    }

    if (!finalPlaceTypeId) {
      return res.status(400).json({ success: false, error: { code: 'VAL_008', message: 'placeTypeId is required' } });
    }

    if (!isValidUUID(finalPlaceTypeId)) {
      return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid placeTypeId UUID format.' } });
    }

    const table = await prisma.table.create({
      data: {
        tableNumber: finalTableNumber,
        placeTypeId: finalPlaceTypeId,
        capacity: finalCapacity,
        isActive: isActive !== undefined ? isActive : true,
      },
      include: { placeType: true }
    });

    await redisService.del(`table:available:${finalPlaceTypeId}`);
    await redisService.del('table:available:all');

    return res.status(201).json(table); // compatible with admin crud return
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { code: 'CREATE_ERR', message: err.message } });
  }
});

// Delete Table (Admin Only)
router.delete('/tables/:id', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const table = await prisma.table.delete({ where: { id } });
    await redisService.del(`table:available:${table.placeTypeId}`);
    await redisService.del('table:available:all');
    return res.json({ message: 'Table deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'DELETE_ERR', message: err.message } });
  }
});

// Edit Table (Admin Only)
router.put('/tables/:id', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { tableNumber, number, placeTypeId, placeType, capacity, isActive } = req.body;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid table ID UUID format.' } });
  }

  try {
    // 1. Find existing table
    const table = await prisma.table.findUnique({
      where: { id },
      include: {
        tokens: {
          where: { status: { in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED, TokenStatus.EXPIRED] } }
        }
      }
    }) as any;

    if (!table) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table not found' } });
    }

    // 2. Business Rule: Prevent editing occupied tables
    if (table.status === 'occupied' || table.tokens.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFLICT_OCCUPIED', message: 'Cannot edit table details while it is occupied or has active sessions.' }
      });
    }

    // 3. Resolve inputs
    const finalTableNumber = tableNumber || number;
    let finalPlaceTypeId = placeTypeId;

    if (finalTableNumber) {
      const tableNumRegex = /^(S|L)-\d{2}$/;
      if (!tableNumRegex.test(finalTableNumber)) {
        return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Table number must match prefix and 2-digit format (S-01 to S-15, L-01 to L-10).' } });
      }
    }

    if (!finalPlaceTypeId && placeType) {
      const ptObj = await prisma.placeTypeConfig.findUnique({ where: { name: placeType } });
      if (ptObj) finalPlaceTypeId = ptObj.id;
    }

    if (finalPlaceTypeId && !isValidUUID(finalPlaceTypeId)) {
      return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid placeTypeId UUID format.' } });
    }

    const finalCapacity = capacity ? parseInt(capacity, 10) : undefined;
    if (finalCapacity !== undefined && (isNaN(finalCapacity) || finalCapacity < 1 || finalCapacity > 100)) {
      return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Table capacity must be between 1 and 100.' } });
    }

    const updated = await prisma.table.update({
      where: { id },
      data: {
        tableNumber: finalTableNumber !== undefined ? finalTableNumber : undefined,
        placeTypeId: finalPlaceTypeId !== undefined ? finalPlaceTypeId : undefined,
        capacity: finalCapacity !== undefined ? finalCapacity : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
      },
      include: { placeType: true }
    });

    await redisService.del(`table:available:${updated.placeTypeId}`);
    await redisService.del(`table:available:${table.placeTypeId}`);
    await redisService.del('table:available:all');

    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { code: 'EDIT_ERR', message: err.message } });
  }
});

// Update Table Status (Authenticated)
router.patch('/tables/:id/status', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid table ID UUID format.' } });
  }

  const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
  if (!status || !validStatuses.includes(status.toLowerCase())) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` } });
  }

  const targetStatus = status.toLowerCase();

  try {
    const table = await prisma.table.findUnique({
      where: { id },
      include: {
        tokens: {
          where: { status: { in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED, TokenStatus.EXPIRED] } }
        }
      }
    }) as any;

    if (!table) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Table not found' } });
    }

    const hasActiveSession = table.tokens.length > 0;

    // 1. Business Rule: Prevent maintenance changes during active sessions
    if (targetStatus === 'maintenance' && (table.status === 'occupied' || hasActiveSession)) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFLICT_ACTIVE_SESSION', message: 'Cannot set table to maintenance while it has active sessions.' }
      });
    }

    // 2. Business Rule: Prevent reservation conflicts
    if (targetStatus === 'reserved' && (table.status === 'occupied' || hasActiveSession)) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFLICT_ACTIVE_SESSION', message: 'Cannot reserve table while it is occupied or has active sessions.' }
      });
    }

    // 3. Business Rule: Prevent available if active sessions exist
    if (targetStatus === 'available' && hasActiveSession) {
      return res.status(400).json({
        success: false,
        error: { code: 'CONFLICT_ACTIVE_SESSION', message: 'Cannot make table available while there is an active session. Release the session first.' }
      });
    }

    // Update status
    const updated = await prisma.table.update({
      where: { id },
      data: {
        status: targetStatus,
        maintenanceStart: targetStatus !== 'maintenance' ? null : undefined,
        maintenanceEnd: targetStatus !== 'maintenance' ? null : undefined,
      },
      include: { placeType: true }
    });

    await redisService.del(`table:available:${updated.placeTypeId}`);
    await redisService.del('table:available:all');

    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { code: 'STATUS_ERR', message: err.message } });
  }
});

// ==========================================
// 3. RECEPTIONIST CHECK-IN & SESSIONS
// ==========================================

const checkInHandler = async (req: AuthenticatedRequest, res: Response) => {
  const {
    phoneNumber,
    customerName,
    email,
    persons,
    personsCount,
    placeType,
    placeTypeId,
    tableNumber,
    tableId,
    amountPaid,
    paymentVerified,
    cardUid,
    nfcCardUid,
    deliveryMode: reqDeliveryMode,
  } = req.body;

  const { nfcEnabled, emailQrEnabled } = await tokenService.getConfiguredDeliveryAvailability();
  const deliveryMode = reqDeliveryMode || (nfcEnabled ? 'NFC_CARD' : 'EMAIL_QR');

  if (deliveryMode === 'NFC_CARD' && !nfcEnabled) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'NFC Card delivery method is currently disabled by administrator.' } });
  }
  if (deliveryMode === 'EMAIL_QR' && !emailQrEnabled) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Email QR delivery method is currently disabled by administrator.' } });
  }

  const finalCardUid = nfcCardUid || cardUid;
  if (deliveryMode === 'NFC_CARD') {
    const cardUidRegex = /^[A-Z0-9-]{4,50}$/;
    if (!finalCardUid || !cardUidRegex.test(finalCardUid)) {
      return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'NFC Card UID must be 4-50 uppercase alphanumeric characters or hyphens.' } });
    }
  }

  const phoneRegex = /^(?:\+91)?[6-9]\d{9}$/;
  if (!phoneNumber || !phoneRegex.test(phoneNumber)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Please enter a valid 10-digit Indian phone number starting with 6-9.' } });
  }
  const finalPhoneNumber = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

  const nameRegex = /^[a-zA-Z\s.'-]{2,100}$/;
  if (!customerName || !nameRegex.test(customerName)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Customer name must contain only letters, spaces, periods, apostrophes, or hyphens (2-100 characters).' } });
  }
  const finalCustomerName = customerName;

  if (deliveryMode === 'EMAIL_QR') {
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Email address is mandatory when system operates in EMAIL_QR mode.' } });
    }
  }

  if (email && email.trim()) {
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Please enter a valid Gmail address using only lowercase letters, numbers, and dots.' } });
    }
  }
  let finalEmail = email ? email.trim().toLowerCase() : null;

  const finalPersonsCount = parseInt(personsCount || persons || '1', 10);
  if (isNaN(finalPersonsCount) || finalPersonsCount < 1) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Persons count must be an integer greater than or equal to 1.' } });
  }

  if (placeType && placeType !== 'STANDING_BAR' && placeType !== 'PREMIUM_LOUNGE') {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Place type must be either STANDING_BAR or PREMIUM_LOUNGE.' } });
  }

  let finalPlaceTypeId = placeTypeId;
  let finalTableId = tableId;

  if (placeTypeId && !isValidUUID(placeTypeId)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid placeTypeId UUID format.' } });
  }
  if (tableId && !isValidUUID(tableId)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid tableId UUID format.' } });
  }

  if (deliveryMode === 'NFC_CARD') {
    if (!finalPhoneNumber || !finalCustomerName || !finalPersonsCount || !finalCardUid || (!tableNumber && !tableId) || (!placeType && !placeTypeId)) {
      return res.status(400).json({ success: false, error: { code: 'VAL_008', message: 'Check-in details are incomplete. Please fill out all required fields.' } });
    }
  } else {
    if (!finalPhoneNumber || !finalCustomerName || !finalPersonsCount || !email || (!tableNumber && !tableId) || (!placeType && !placeTypeId)) {
      return res.status(400).json({ success: false, error: { code: 'VAL_008', message: 'Check-in details are incomplete. Please fill out all required fields.' } });
    }
  }

  try {
    // Resolve Place Type ID
    if (finalPlaceTypeId === 'undefined' || finalPlaceTypeId === 'null' || finalPlaceTypeId === '') {
      finalPlaceTypeId = undefined;
    }
    if (finalPlaceTypeId) {
      const exists = await prisma.placeTypeConfig.findUnique({ where: { id: finalPlaceTypeId } });
      if (!exists) {
        finalPlaceTypeId = undefined;
      }
    }
    if (!finalPlaceTypeId && placeType) {
      const ptObj = await prisma.placeTypeConfig.findUnique({ where: { name: placeType } });
      if (ptObj) finalPlaceTypeId = ptObj.id;
    }

    // Resolve Table ID
    if (!finalTableId && tableNumber) {
      const normalizedTableNumber = tableNumber.trim().replace(/^([SL])(\d{2})$/i, '$1-$2').toUpperCase();
      const tableObj = await prisma.table.findFirst({
        where: { tableNumber: normalizedTableNumber, placeTypeId: finalPlaceTypeId }
      });
      if (tableObj) finalTableId = tableObj.id;
    }

    if (!finalPlaceTypeId || !finalTableId) {
      return res.status(400).json({ success: false, error: { code: 'VAL_009', message: 'Invalid seating or table selection. Please verify and try again.' } });
    }

    // Find table to check capacity
    const tableObj = await prisma.table.findUnique({ where: { id: finalTableId } });
    if (!tableObj) {
      return res.status(400).json({ success: false, error: { code: 'TABLE_ERR', message: 'Selected table was not found. Please select a valid table.' } });
    }
    if (finalPersonsCount > tableObj.capacity) {
      return res.status(400).json({ success: false, error: { code: 'TABLE_ERR', message: `Group size of ${finalPersonsCount} exceeds table capacity of ${tableObj.capacity}.` } });
    }

    // Find card if in NFC mode
    let card = null;
    if (deliveryMode === 'NFC_CARD') {
      card = await prisma.card.findUnique({ where: { nfcUid: finalCardUid } });
      if (!card) {
        return res.status(400).json({ success: false, error: { code: 'CARD_001', message: 'NFC card is not registered' } });
      }
      if (card.status !== 'available') {
        return res.status(400).json({ success: false, error: { code: 'CARD_002', message: `NFC card cannot be assigned. Card status is currently '${card.status}'.` } });
      }
    }

    // Find place type config
    const ptConfig = await prisma.placeTypeConfig.findUnique({ where: { id: finalPlaceTypeId } });
    if (!ptConfig) {
      return res.status(400).json({ success: false, error: { code: 'PT_001', message: 'Invalid seating selection. Please select a valid seating option.' } });
    }

    // Calculate details
    const calculatedAmount = finalPersonsCount * parseFloat(ptConfig.ratePerPerson.toString());
    const finalAmountPaid = amountPaid !== undefined ? parseFloat(amountPaid) : calculatedAmount;

    let finalIssuedBy = req.user?.id || '';
    if (finalIssuedBy) {
      const userExists = await prisma.user.findUnique({ where: { id: finalIssuedBy } });
      if (!userExists) {
        finalIssuedBy = '';
      }
    }
    if (!finalIssuedBy) {
      const fallbackUser = await prisma.user.findFirst({ where: { role: { name: 'receptionist' } } });
      finalIssuedBy = fallbackUser?.id || (await prisma.user.findFirst())?.id || '';
    }

    const token = await tokenService.createToken({
      phoneNumber: finalPhoneNumber,
      customerName: finalCustomerName,
      email: finalEmail || undefined,
      personsCount: finalPersonsCount,
      placeTypeId: finalPlaceTypeId,
      tableId: finalTableId,
      amountPaid: finalAmountPaid,
      paymentVerified: paymentVerified !== undefined ? paymentVerified : true,
      issuedBy: finalIssuedBy,
      nfcCardUid: deliveryMode === 'NFC_CARD' ? finalCardUid : undefined,
      cardId: card ? card.id : undefined,
    });

    // Match the old format that the React Native client expects
    const responseData = {
      id: token.id,
      tokenNumber: token.tokenNumber,
      phoneNumber: token.customer.phoneNumber,
      customerName: token.customer.name,
      email: token.customer.email,
      persons: token.personsCount,
      placeType: token.placeType.name,
      tableId: token.tableId,
      tableNumber: token.table?.tableNumber || null,
      amountPaid: token.amountPaid,
      paymentVerified: token.paymentVerified,
      startTime: token.startTime.toISOString(),
      endTime: token.endTime.toISOString(),
      redemptionLimit: token.totalRedemptionsAllowed,
      redemptionCount: token.redemptionsUsed,
      status: token.status.toUpperCase(),
      cardUid: deliveryMode === 'NFC_CARD' ? finalCardUid : null,
      createdAt: token.issuedAt.toISOString(),
    };

    return res.status(201).json(responseData);
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
};

const checkInPendingHandler = async (req: AuthenticatedRequest, res: Response) => {
  const {
    phoneNumber,
    customerName,
    email,
    personsCount,
    persons,
    placeType,
    placeTypeId,
    tableId,
    tableNumber,
  } = req.body;

  const phoneRegex = /^(?:\+91)?[6-9]\d{9}$/;
  if (!phoneNumber || !phoneRegex.test(phoneNumber)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Please enter a valid 10-digit Indian phone number starting with 6-9.' } });
  }
  const finalPhoneNumber = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

  const nameRegex = /^[a-zA-Z\s.'-]{2,100}$/;
  if (!customerName || !nameRegex.test(customerName)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Customer name must contain only letters, spaces, periods, apostrophes, or hyphens (2-100 characters).' } });
  }

  if (!email || !email.trim()) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Email address is mandatory when system operates in EMAIL_QR mode.' } });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Please enter a valid Gmail address using only lowercase letters, numbers, and dots.' } });
  }
  const finalEmail = email.trim().toLowerCase();

  const finalPersonsCount = parseInt(personsCount || persons || '1', 10);
  if (isNaN(finalPersonsCount) || finalPersonsCount < 1) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Persons count must be an integer greater than or equal to 1.' } });
  }

  if (placeType && placeType !== 'STANDING_BAR' && placeType !== 'PREMIUM_LOUNGE') {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Place type must be either STANDING_BAR or PREMIUM_LOUNGE.' } });
  }

  try {
    let finalPlaceTypeId = placeTypeId;
    if (finalPlaceTypeId === 'undefined' || finalPlaceTypeId === 'null' || finalPlaceTypeId === '') {
      finalPlaceTypeId = undefined;
    }
    if (finalPlaceTypeId) {
      const exists = await prisma.placeTypeConfig.findUnique({ where: { id: finalPlaceTypeId } });
      if (!exists) {
        finalPlaceTypeId = undefined;
      }
    }
    if (!finalPlaceTypeId && placeType) {
      const ptObj = await prisma.placeTypeConfig.findUnique({ where: { name: placeType } });
      if (ptObj) finalPlaceTypeId = ptObj.id;
    }
    if (!finalPlaceTypeId) {
      return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Invalid place type.' } });
    }

    const placeTypeObj = await prisma.placeTypeConfig.findUnique({ where: { id: finalPlaceTypeId } });
    if (!placeTypeObj) {
      return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Invalid seating selection. Please select a valid seating option.' } });
    }

    // If resuming/updating an existing pending token
    const { tokenNumber } = req.body;
    if (tokenNumber) {
      const existingToken = await prisma.token.findUnique({
        where: { tokenNumber }
      });
      if (!existingToken) {
        return res.status(404).json({ success: false, error: { message: 'Pending token not found' } });
      }
      if (existingToken.status !== TokenStatus.PENDING_PAYMENT) {
        return res.status(400).json({ success: false, error: { message: `Cannot update token with status ${existingToken.status}` } });
      }

      // Check if this customer already has another active session (by phone or email)
      const customerRecord = await prisma.customer.findUnique({
        where: { id: existingToken.customerId }
      });
      if (customerRecord) {
        const orConditions: any[] = [
          { customer: { phoneNumber: customerRecord.phoneNumber } }
        ];
        if (customerRecord.email && customerRecord.email.trim()) {
          orConditions.push({ customer: { email: customerRecord.email.trim().toLowerCase() } });
        }

        const otherActiveOrPendingToken = await prisma.token.findFirst({
          where: {
            id: { not: existingToken.id },
            OR: orConditions,
            status: {
              in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED, TokenStatus.PENDING_PAYMENT]
            }
          }
        });

        if (otherActiveOrPendingToken) {
          const isPending = otherActiveOrPendingToken.status === TokenStatus.PENDING_PAYMENT;
          const msg = isPending
            ? `A pending payment session already exists for this customer.`
            : `Customer already has an active session.`;
          return res.status(400).json({ success: false, error: { message: msg } });
        }
      }

      // If assigning a table
      let resolvedTableId = existingToken.tableId;
      if (tableNumber) {
        const table = await prisma.table.findFirst({
          where: { tableNumber: tableNumber, placeTypeId: finalPlaceTypeId }
        });
        if (!table) {
          return res.status(404).json({ success: false, error: { message: `Table ${tableNumber} not found` } });
        }
        if (table.status !== 'available' && table.currentTokenId !== existingToken.id) {
          return res.status(400).json({ success: false, error: { message: `Table ${tableNumber} is not available.` } });
        }
        resolvedTableId = table.id;
      }

      // Update token tableId and check-in details
      const updatedToken = await prisma.token.update({
        where: { id: existingToken.id },
        data: {
          tableId: resolvedTableId,
          personsCount: finalPersonsCount,
          placeTypeId: finalPlaceTypeId,
        },
        include: { customer: true, placeType: true, table: true }
      });

      // Send email if table is assigned now and email wasn't sent
      if (resolvedTableId && !existingToken.emailSent) {
        await prisma.token.update({
          where: { id: existingToken.id },
          data: { emailSent: true, emailDeliveryStatus: 'SENT', emailSentAt: new Date() }
        });
        emailNotificationService.enqueueEmailJob(finalEmail, existingToken.tokenNumber, customerName);
      }

      // Sync Redis cache
      await redisService.setex(`token:${tokenNumber}`, 86400, JSON.stringify(updatedToken));

      const responseData = {
        id: updatedToken.id,
        tokenNumber: updatedToken.tokenNumber,
        phoneNumber: updatedToken.customer.phoneNumber,
        customerName: updatedToken.customer.name,
        email: updatedToken.customer.email,
        persons: updatedToken.personsCount,
        placeType: updatedToken.placeType.name,
        tableId: updatedToken.tableId,
        tableNumber: updatedToken.table?.tableNumber || null,
        amountPaid: parseFloat(updatedToken.amountPaid.toString()),
        paymentVerified: updatedToken.paymentVerified,
        emailSent: updatedToken.emailSent,
        startTime: updatedToken.startTime.toISOString(),
        endTime: updatedToken.endTime.toISOString(),
        redemptionLimit: updatedToken.totalRedemptionsAllowed,
        redemptionCount: updatedToken.redemptionsUsed,
        status: updatedToken.status.toUpperCase(),
        createdAt: updatedToken.issuedAt.toISOString(),
      };

      return res.status(200).json(responseData);
    }

    let finalIssuedBy = req.user?.id || '';
    if (finalIssuedBy) {
      const userExists = await prisma.user.findUnique({ where: { id: finalIssuedBy } });
      if (!userExists) {
        finalIssuedBy = '';
      }
    }
    if (!finalIssuedBy) {
      const fallbackUser = await prisma.user.findFirst({ where: { role: { name: 'receptionist' } } });
      finalIssuedBy = fallbackUser?.id || (await prisma.user.findFirst())?.id || '';
    }

    const token = await tokenService.createPendingToken({
      phoneNumber: finalPhoneNumber,
      customerName,
      email: finalEmail,
      personsCount: finalPersonsCount,
      placeTypeId: finalPlaceTypeId,
      issuedBy: finalIssuedBy,
      tableId,
      tableNumber
    });

    if (token.tableId) {
      emailNotificationService.enqueueEmailJob(finalEmail, token.tokenNumber, customerName);
    }

    const responseData = {
      id: token.id,
      tokenNumber: token.tokenNumber,
      phoneNumber: token.customer.phoneNumber,
      customerName: token.customer.name,
      email: token.customer.email,
      persons: token.personsCount,
      placeType: token.placeType.name,
      tableId: token.tableId,
      tableNumber: token.table?.tableNumber || null,
      amountPaid: 0,
      paymentVerified: token.paymentVerified,
      startTime: token.startTime.toISOString(),
      endTime: token.endTime.toISOString(),
      redemptionLimit: token.totalRedemptionsAllowed,
      redemptionCount: token.redemptionsUsed,
      status: token.status.toUpperCase(),
      cardUid: null,
      createdAt: token.issuedAt.toISOString(),
    };

    return res.status(201).json(responseData);
  } catch (err: any) {
    if (err.code === 'PENDING_SESSION_EXISTS') {
      return res.status(400).json({
        success: false,
        code: 'PENDING_SESSION_EXISTS',
        error: { message: err.message },
        tokenNumber: err.tokenNumber
      });
    }
    console.error(err);
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
};

const verifyQrHandler = async (req: Request, res: Response) => {
  try {
    const { tokenNumber } = req.params;

    const token = await prisma.token.findUnique({
      where: { tokenNumber },
      include: {
        customer: true,
        placeType: true,
        table: true
      }
    });

    if (!token) {
      return res.status(404).json({ success: false, error: { message: 'QR token not found in database.' } });
    }
    if (token.deliveryMode !== 'EMAIL_QR') {
      return res.status(400).json({ success: false, error: { message: 'Token is not an Email QR token.' } });
    }
    if (token.paymentVerified) {
      return res.status(400).json({ success: false, error: { message: 'This QR session has already been activated.' } });
    }
    if (token.status !== TokenStatus.PENDING_PAYMENT) {
      return res.status(400).json({ success: false, error: { message: `Token has status '${token.status}' and cannot be validated.` } });
    }
    const now = new Date();
    const isPendingExpired = now.getTime() > token.issuedAt.getTime() + 20 * 60 * 1000;
    if (isPendingExpired) {
      await prisma.$transaction(async (tx) => {
        await tx.token.update({
          where: { id: token.id },
          data: { status: TokenStatus.EXPIRED }
        });

        if (token.tableId) {
          const table = await tx.table.findUnique({ where: { id: token.tableId } });
          if (table && table.currentTokenId === token.id) {
            await tx.table.update({
              where: { id: token.tableId },
              data: {
                status: 'available',
                currentTokenId: null,
                occupiedSince: null,
                maintenanceStart: null,
                maintenanceEnd: null
              }
            });

            await tx.tableOccupancyLog.updateMany({
              where: {
                tableId: token.tableId,
                tokenId: token.id,
                vacatedAt: null
              },
              data: { vacatedAt: now }
            });
            await redisService.del(`table:${token.tableId}:status`);
          }
        }
      });
      return res.status(400).json({ success: false, error: { message: 'QR token has expired.' } });
    }

    const responseData = {
      id: token.id,
      tokenNumber: token.tokenNumber,
      phoneNumber: token.customer.phoneNumber,
      customerName: token.customer.name,
      email: token.customer.email,
      persons: token.personsCount,
      placeType: token.placeType.name,
      tableId: token.tableId,
      tableNumber: token.table?.tableNumber || null,
      amountPaid: token.amountPaid,
      paymentVerified: token.paymentVerified,
      startTime: token.startTime.toISOString(),
      endTime: token.endTime.toISOString(),
      redemptionLimit: token.totalRedemptionsAllowed,
      redemptionCount: token.redemptionsUsed,
      status: token.status.toUpperCase(),
      cardUid: null,
      createdAt: token.issuedAt.toISOString(),
    };

    return res.status(200).json(responseData);
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
};

const activateSessionHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenNumber, tableNumber, amountPaid } = req.body;
  const activatedBy = req.user?.id || 'receptionist';

  try {
    const updatedToken = await tokenService.activatePendingSession(
      tokenNumber,
      tableNumber,
      amountPaid ? parseFloat(amountPaid) : 0,
      activatedBy
    );

    const responseData = {
      id: updatedToken.id,
      tokenNumber: updatedToken.tokenNumber,
      phoneNumber: updatedToken.customer.phoneNumber,
      customerName: updatedToken.customer.name,
      email: updatedToken.customer.email,
      persons: updatedToken.personsCount,
      placeType: updatedToken.placeType.name,
      tableId: updatedToken.tableId,
      tableNumber: updatedToken.table.tableNumber,
      amountPaid: updatedToken.amountPaid,
      paymentVerified: updatedToken.paymentVerified,
      startTime: updatedToken.startTime.toISOString(),
      endTime: updatedToken.endTime.toISOString(),
      redemptionLimit: updatedToken.totalRedemptionsAllowed,
      redemptionCount: updatedToken.redemptionsUsed,
      status: updatedToken.status.toUpperCase(),
      cardUid: null,
      createdAt: updatedToken.issuedAt.toISOString(),
    };

    return res.status(200).json(responseData);
  } catch (err: any) {
    if (err.code === 'CONFLICT') {
      return res.status(409).json({ success: false, error: { message: err.message } });
    }
    console.error(err);
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
};

const cancelSessionHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenNumber, cancelReason } = req.body;
  const cancelledBy = req.user?.id || 'receptionist';

  try {
    const cancelEnum = cancelReason === 'PAYMENT_CANCELLED' ? CancelReason.PAYMENT_CANCELLED : CancelReason.USER_CANCELLED;
    const updatedToken = await tokenService.cancelPendingSession(tokenNumber, cancelledBy, cancelEnum);
    return res.status(200).json({ success: true, message: 'Session cancelled successfully.', data: updatedToken });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
};

// Map receptionist check-in endpoints
router.post('/check-in', authenticate, authorize(['receptionist', 'admin']), checkInHandler);
router.post('/tokens/create', authenticate, authorize(['receptionist', 'admin']), checkInHandler);
router.post('/check-in/pending', authenticate, authorize(['receptionist', 'admin']), checkInPendingHandler);
router.get('/check-in/pending-list', authenticate, authorize(['receptionist', 'admin']), async (req: Request, res: Response) => {
  try {
    await tokenService.reconcileSystemState();
    const pendingTokens = await prisma.token.findMany({
      where: { status: TokenStatus.PENDING_PAYMENT },
      include: { customer: true, placeType: true, table: true },
      orderBy: { issuedAt: 'desc' },
    });
    
    // Map response keys for old client compatibility
    const oldTokens = pendingTokens.map((t: any) => ({
      id: t.id,
      tokenNumber: t.tokenNumber,
      phoneNumber: t.customer.phoneNumber,
      customerName: t.customer.name,
      email: t.customer.email,
      persons: t.personsCount,
      placeType: t.placeType.name,
      tableId: t.tableId,
      tableNumber: t.table?.tableNumber || null,
      amountPaid: parseFloat(t.amountPaid.toString()),
      paymentVerified: t.paymentVerified,
      emailSent: t.emailSent,
      startTime: t.startTime.toISOString(),
      endTime: t.endTime.toISOString(),
      redemptionLimit: t.totalRedemptionsAllowed,
      redemptionCount: t.redemptionsUsed,
      status: t.status.toUpperCase(),
      createdAt: t.issuedAt.toISOString(),
    }));

    return res.json(oldTokens);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});
router.get('/check-in/verify-qr/:tokenNumber', authenticate, authorize(['receptionist', 'admin']), verifyQrHandler);
router.post('/check-in/activate', authenticate, authorize(['receptionist', 'admin']), activateSessionHandler);
router.post('/check-in/cancel', authenticate, authorize(['receptionist', 'admin']), cancelSessionHandler);

// Generate QR Base64 or URL
router.post('/tokens/:id/generate-qr', authenticate, authorize(['receptionist', 'admin']), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = await prisma.token.findUnique({
      where: { id },
      include: { placeType: true, customer: true, table: true }
    });
    if (!token) {
      return res.status(404).json({ success: false, error: { message: 'Token not found' } });
    }
    
    const signedPayload = tokenService.generateQRTokenPayload(token.tokenNumber);
    const qrImageURL = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(signedPayload)}`;
    
    return res.json({
      success: true,
      data: { qrImage: qrImageURL, expiresAt: token.endTime }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Trigger/Resend Email confirmation
const sendEmailHandler = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const token = await prisma.token.findUnique({
      where: { id },
      include: { placeType: true, customer: true, table: true }
    });
    if (!token) {
      return res.status(404).json({ success: false, error: { message: 'Token not found' } });
    }
    if (!token.customer.email) {
      return res.status(400).json({ success: false, error: { message: 'Customer email is missing' } });
    }

    emailNotificationService.enqueueEmailJob(
      token.customer.email,
      token.tokenNumber,
      token.customer.name
    );

    return res.json({
      success: true,
      data: { success: true, emailStatus: 'PENDING' }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
};

router.post('/tokens/:id/send-email', authenticate, authorize(['receptionist', 'admin']), sendEmailHandler);
router.post('/tokens/:id/resend-email', authenticate, authorize(['receptionist', 'admin']), sendEmailHandler);

// Verify signed QR token payload
router.post('/qr/verify', authenticate, authorize(['bartender', 'receptionist', 'admin']), async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: { message: 'token payload is required.' } });
  }

  try {
    const tokenRecord = await tokenService.getTokenByNumber(token);
    if (!tokenRecord) {
      return res.status(404).json({ success: false, error: { message: 'Token not found' } });
    }

    return res.json({
      success: true,
      data: {
        valid: tokenRecord.status === TokenStatus.ACTIVE || tokenRecord.status === TokenStatus.EXTENDED,
        tokenNumber: tokenRecord.tokenNumber,
        remaining: tokenRecord.totalRedemptionsAllowed - tokenRecord.redemptionsUsed,
        totalAllowed: tokenRecord.totalRedemptionsAllowed,
        status: tokenRecord.status,
        endTime: tokenRecord.endTime
      }
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: { code: 'QR_INVALID_SIGNATURE', message: 'QR Code signature is invalid or forged.' } });
  }
});

// Unified Redemption Endpoint
router.post('/redemptions', authenticate, authorize(['bartender', 'admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { payload, presentationType, bartenderId } = req.body;
  
  if (!payload) {
    return res.status(400).json({ success: false, error: { message: 'payload is required.' } });
  }

  const finalPresentationType = presentationType || 'NFC_TAP';
  if (finalPresentationType !== 'NFC_TAP' && finalPresentationType !== 'QR_SCAN') {
    return res.status(400).json({ success: false, error: { message: 'Invalid presentationType.' } });
  }

  const finalBartenderId = bartenderId || req.user?.id || '';
  if (finalBartenderId && !isValidUUID(finalBartenderId)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid bartenderId UUID format.' } });
  }

  try {
    const result = await redemptionService.processRedemption(
      payload,
      finalBartenderId,
      undefined,
      finalPresentationType
    );

    return res.json({
      success: true,
      message: 'Redemption recorded successfully',
      data: result
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { message: err.message } });
  }
});

// Admin update configurations
router.put('/config/delivery-methods', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { nfcEnabled, emailQrEnabled } = req.body;
  if (typeof nfcEnabled !== 'boolean' || typeof emailQrEnabled !== 'boolean') {
    return res.status(400).json({ success: false, error: { message: 'Invalid values. nfcEnabled and emailQrEnabled must be boolean values.' } });
  }
  if (!nfcEnabled && !emailQrEnabled) {
    return res.status(400).json({ success: false, error: { message: 'At least one delivery method must be enabled.' } });
  }

  try {
    await prisma.systemConfig.upsert({
      where: { configKey: 'nfc_card_enabled' },
      update: { configValue: nfcEnabled ? 'true' : 'false' },
      create: { configKey: 'nfc_card_enabled', configValue: nfcEnabled ? 'true' : 'false' }
    });

    await prisma.systemConfig.upsert({
      where: { configKey: 'email_qr_enabled' },
      update: { configValue: emailQrEnabled ? 'true' : 'false' },
      create: { configKey: 'email_qr_enabled', configValue: emailQrEnabled ? 'true' : 'false' }
    });

    await redisService.setex('config:nfc_card_enabled', 86400, nfcEnabled ? 'true' : 'false');
    await redisService.setex('config:email_qr_enabled', 86400, emailQrEnabled ? 'true' : 'false');

    return res.json({
      success: true,
      nfcEnabled,
      emailQrEnabled
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Admin get current configurations
router.get('/config/delivery-methods', authenticate, async (req: Request, res: Response) => {
  try {
    const { nfcEnabled, emailQrEnabled } = await tokenService.getConfiguredDeliveryAvailability();
    return res.json({ success: true, nfcEnabled, emailQrEnabled });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Legacy Compatibility Aliases
router.get('/config/delivery-mode', authenticate, async (req: Request, res: Response) => {
  try {
    const deliveryMode = await tokenService.getConfiguredDeliveryMode();
    return res.json({ success: true, deliveryMode });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

router.put('/config/delivery-mode', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { mode } = req.body;
  if (mode !== 'NFC_CARD' && mode !== 'EMAIL_QR') {
    return res.status(400).json({ success: false, error: { message: 'Invalid mode. Must be NFC_CARD or EMAIL_QR.' } });
  }
  try {
    const nfcEnabled = mode === 'NFC_CARD';
    const emailQrEnabled = mode === 'EMAIL_QR';

    await prisma.systemConfig.upsert({
      where: { configKey: 'nfc_card_enabled' },
      update: { configValue: nfcEnabled ? 'true' : 'false' },
      create: { configKey: 'nfc_card_enabled', configValue: nfcEnabled ? 'true' : 'false' }
    });

    await prisma.systemConfig.upsert({
      where: { configKey: 'email_qr_enabled' },
      update: { configValue: emailQrEnabled ? 'true' : 'false' },
      create: { configKey: 'email_qr_enabled', configValue: emailQrEnabled ? 'true' : 'false' }
    });

    await redisService.setex('config:nfc_card_enabled', 86400, nfcEnabled ? 'true' : 'false');
    await redisService.setex('config:email_qr_enabled', 86400, emailQrEnabled ? 'true' : 'false');

    return res.json({ success: true, message: `Token Delivery Mode updated to ${mode}` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// Get active tokens (list)
router.get('/tokens/active', authenticate, async (req: Request, res: Response) => {
  try {
    await tokenService.reconcileSystemState();
    const activeTokens = await prisma.token.findMany({
      where: { status: { in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED] } },
      include: { customer: true, placeType: true, table: true, card: true },
      orderBy: { startTime: 'desc' },
    });
    
    // Map response for old client compatibility
    const oldTokens = activeTokens.map((t: any) => ({
      id: t.id,
      tokenNumber: t.tokenNumber,
      phoneNumber: t.customer.phoneNumber,
      customerName: t.customer.name,
      email: t.customer.email,
      persons: t.personsCount,
      placeType: t.placeType.name,
      tableId: t.tableId,
      tableNumber: t.table?.tableNumber || null,
      amountPaid: t.amountPaid,
      paymentVerified: t.paymentVerified,
      startTime: t.startTime.toISOString(),
      endTime: t.endTime.toISOString(),
      redemptionLimit: t.totalRedemptionsAllowed,
      redemptionCount: t.redemptionsUsed,
      status: t.status.toUpperCase(),
      cardUid: t.card?.nfcUid,
      createdAt: t.issuedAt.toISOString(),
      deliveryMode: t.deliveryMode,
      table: t.table ? {
        id: t.table.id,
        number: t.table.tableNumber,
        placeType: t.placeType.name,
        status: t.table.status.toUpperCase(),
      } : null
    }));

    return res.json(oldTokens);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// Export sessions as CSV (Admin only)
router.get('/admin/sessions/export', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { status, startDate, endDate, paymentVerified } = req.query;

    const whereClause: any = {};
    if (status && status !== 'all') {
      whereClause.status = (status as string).toUpperCase() as any;
    }
    if (startDate || endDate) {
      whereClause.startTime = {};
      if (startDate) whereClause.startTime.gte = new Date(startDate as string);
      if (endDate) whereClause.startTime.lte = new Date(endDate as string);
    }
    if (paymentVerified && paymentVerified !== 'all') {
      whereClause.paymentVerified = paymentVerified === 'true';
    }

    const tokens = await prisma.token.findMany({
      where: whereClause,
      include: { customer: true, table: true },
      orderBy: { issuedAt: 'desc' }
    });

    const headers = 'Token Number,Customer Name,Phone Number,Table,Status,Amount Paid,Guests,Start Time,End Time\n';
    const rows = tokens.map(t => {
      const tableStr = t.table ? t.table.tableNumber : 'N/A';
      return `"${t.tokenNumber}","${t.customer.name.replace(/"/g, '""')}","${t.customer.phoneNumber}","${tableStr}","${t.status}","${t.amountPaid.toString()}","${t.personsCount}","${t.startTime.toISOString()}","${t.endTime.toISOString()}"`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sessions_export.csv"');
    return res.status(200).send(headers + rows);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Get all sessions (Admin only)
router.get('/admin/sessions', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    await tokenService.reconcileSystemState();
    const sessions = await prisma.token.findMany({
      include: { 
        customer: true, 
        placeType: true, 
        table: true, 
        card: true,
        redemptions: { include: { bartender: true } },
        extensions: { include: { approver: true } },
        creator: true,
        closer: true
      },
      orderBy: { issuedAt: 'desc' },
    });
    
    const mapped = sessions.map((t: any) => ({
      id: t.id,
      tokenNumber: t.tokenNumber,
      phoneNumber: t.customer.phoneNumber,
      customerName: t.customer.name,
      email: t.customer.email,
      persons: t.personsCount,
      placeType: t.placeType.name,
      tableId: t.tableId,
      tableNumber: t.table?.tableNumber || null,
      amountPaid: parseFloat(t.amountPaid.toString()),
      paymentVerified: t.paymentVerified,
      startTime: t.startTime.toISOString(),
      endTime: t.endTime.toISOString(),
      redemptionLimit: t.totalRedemptionsAllowed,
      redemptionCount: t.redemptionsUsed,
      status: t.status.toLowerCase(),
      cardUid: t.card?.nfcUid || null,
      createdAt: t.issuedAt.toISOString(),
      deliveryMode: t.deliveryMode,
      table: t.table ? {
        id: t.table.id,
        number: t.table.tableNumber,
        placeType: t.placeType.name,
        status: t.table.status.toUpperCase(),
      } : null,
      // Enhanced audit trail & history parameters
      createdBy: t.creator?.fullName || t.issuedBy,
      closedBy: t.closer?.fullName || t.closedBy || null,
      closedAt: t.closedAt ? t.closedAt.toISOString() : null,
      cancelledAt: t.cancelledAt ? t.cancelledAt.toISOString() : null,
      cancelledBy: t.cancelledBy || null,
      cancelReason: t.cancelReason || null,
      customerId: t.customerId,
      customerVisits: t.customer.totalVisits,
      lastVisit: t.customer.lastVisit ? t.customer.lastVisit.toISOString() : null,
      extensions: t.extensions.map((ext: any) => ({
        id: ext.id,
        extraMinutes: ext.extraMinutes,
        additionalAmount: parseFloat(ext.additionalAmount.toString()),
        approvedBy: ext.approver?.fullName || ext.approvedBy,
        extendedAt: ext.extendedAt.toISOString(),
        newEndTime: ext.newEndTime.toISOString()
      })),
      redemptions: t.redemptions.map((red: any) => ({
        id: red.id,
        redemptionSequence: red.redemptionSequence,
        redeemedAt: red.redeemedAt.toISOString(),
        bartenderName: red.bartender?.fullName || red.bartenderId,
        notes: red.notes || null
      }))
    }));

    return res.json(mapped);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERR', message: err.message } });
  }
});

// Get specific token by identifier (token number or card UID)
const getTokenByIdentifier = async (req: Request, res: Response) => {
  const { identifier } = req.params;
  try {
    let token = await prisma.token.findFirst({
      where: {
        OR: [
          { tokenNumber: identifier },
          { card: { nfcUid: identifier } },
        ],
      },
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

    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    const timeRemainingMinutes = Math.max(0, Math.floor((new Date(token.endTime).getTime() - Date.now()) / 60000));
    const redemptionsRemaining = token.totalRedemptionsAllowed - token.redemptionsUsed;

    // Map output for client compatibility
    const responseData = {
      id: token.id,
      tokenNumber: token.tokenNumber,
      phoneNumber: token.customer.phoneNumber,
      customerName: token.customer.name,
      email: token.customer.email,
      persons: token.personsCount,
      placeType: token.placeType.name,
      tableId: token.tableId,
      tableNumber: token.table?.tableNumber || null,
      amountPaid: token.amountPaid,
      paymentVerified: token.paymentVerified,
      startTime: token.startTime.toISOString(),
      endTime: token.endTime.toISOString(),
      timeRemainingMinutes,
      redemptionLimit: token.totalRedemptionsAllowed,
      redemptionCount: token.redemptionsUsed,
      redemptionsRemaining,
      status: token.status.toUpperCase(),
      cardUid: token.card?.nfcUid,
      createdAt: token.issuedAt.toISOString(),
      deliveryMode: token.deliveryMode,
      table: token.table ? {
        id: token.table.id,
        number: token.table.tableNumber,
        status: token.table.status.toUpperCase(),
      } : null,
      redemptions: token.redemptions.map(r => ({
        id: r.id,
        tokenId: r.tokenId,
        bartenderId: r.bartenderId,
        bartenderName: r.bartender.fullName,
        timestamp: r.redeemedAt.toISOString(),
      }))
    };

    return res.json(responseData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

router.get('/token/:identifier', authenticate, getTokenByIdentifier);
router.get('/tokens/:tokenNumber', authenticate, async (req, res) => {
  req.params.identifier = req.params.tokenNumber;
  return getTokenByIdentifier(req, res);
});

// Extend Session
const extendSessionHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenNumber, cardUid, additionalHours, extraMinutes, additionalAmount, approvedBy, additionalPersons } = req.body;
  const paramTokenNumber = req.params.tokenNumber;

  let finalTokenNumber = paramTokenNumber || tokenNumber;
  const finalMinutes = extraMinutes ? parseInt(extraMinutes, 10) : (parseFloat(additionalHours || '0') * 60);
  
  // Resolve token number first to compute finalAmount if needed
  if (!finalTokenNumber && cardUid) {
    const cachedActive = await redisService.get(`token:active:${cardUid}`);
    if (cachedActive) {
      finalTokenNumber = JSON.parse(cachedActive).tokenNumber;
    } else {
      const cardObj = await prisma.card.findUnique({
        where: { nfcUid: cardUid },
        include: { currentToken: true }
      });
      if (cardObj && cardObj.currentToken) {
        finalTokenNumber = cardObj.currentToken.tokenNumber;
      }
    }
  }

  if (finalTokenNumber) {
    const tokenRegex = /^BAR-\d{8}-\d{5}$/;
    if (!tokenRegex.test(finalTokenNumber) || finalTokenNumber.length !== 18) {
      return res.status(400).json({ error: 'Token number must be exactly 18 characters in format BAR-YYYYMMDD-XXXXX.' });
    }
  }
  if (cardUid) {
    const cardUidRegex = /^[A-Z0-9-]{4,50}$/;
    if (!cardUidRegex.test(cardUid)) {
      return res.status(400).json({ error: 'Invalid card UID format.' });
    }
  }
  if (approvedBy && !isValidUUID(approvedBy)) {
    return res.status(400).json({ error: 'Invalid approvedBy UUID format.' });
  }

  let finalAmount = additionalAmount !== undefined ? new Decimal(additionalAmount) : new Decimal(0);
  if (finalAmount.lt(0)) {
    return res.status(400).json({ error: 'Extension amount cannot be negative.' });
  }

  if (finalAmount.eq(0) && additionalHours && finalTokenNumber) {
    try {
      const token = await prisma.token.findFirst({
        where: { tokenNumber: finalTokenNumber },
        include: { placeType: true }
      });
      if (token) {
        const hourlyRate = token.placeType.ratePerPerson.div(token.placeType.baseTimeMinutes / 60);
        const persons = token.personsCount;
        finalAmount = hourlyRate.mul(additionalHours).mul(persons);
      }
    } catch (e) {
      console.error('Failed to calculate extension rate:', e);
    }
  }

  try {
    if (!finalTokenNumber) {
      return res.status(400).json({ error: 'Token number or card UID is required' });
    }

    const updated = await tokenService.extendToken(
      finalTokenNumber,
      finalMinutes,
      finalAmount,
      approvedBy || req.user?.id || '',
      additionalPersons ? parseInt(additionalPersons, 10) : 0
    );

    // Format output for compatibility
    const responseData = {
      message: 'Session extended successfully',
      token: {
        id: updated.id,
        tokenNumber: updated.tokenNumber,
        phoneNumber: updated.customer.phoneNumber,
        customerName: updated.customer.name,
        persons: updated.personsCount,
        placeType: updated.placeType.name,
        tableId: updated.tableId,
        tableNumber: updated.table?.tableNumber || null,
        amountPaid: parseFloat(updated.amountPaid.toString()), // convert when preparing API response
        endTime: updated.endTime.toISOString(),
        redemptionLimit: updated.totalRedemptionsAllowed,
        redemptionCount: updated.redemptionsUsed,
        status: updated.status.toUpperCase(),
      }
    };

    return res.json(responseData);
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};

router.post('/extend', authenticate, authorize(['receptionist', 'admin']), extendSessionHandler);
router.put('/tokens/:tokenNumber/extend', authenticate, authorize(['receptionist', 'admin']), extendSessionHandler);

// Checkout Session
const checkoutSessionHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenNumber, cardUid, eraseCard } = req.body;
  const paramTokenNumber = req.params.tokenNumber;

  let finalTokenNumber = paramTokenNumber || tokenNumber;

  if (finalTokenNumber) {
    const tokenRegex = /^BAR-\d{8}-\d{5}$/;
    if (!tokenRegex.test(finalTokenNumber) || finalTokenNumber.length !== 18) {
      return res.status(400).json({ error: 'Token number must be exactly 18 characters in format BAR-YYYYMMDD-XXXXX.' });
    }
  }
  if (cardUid) {
    const cardUidRegex = /^[A-Z0-9-]{4,50}$/;
    if (!cardUidRegex.test(cardUid)) {
      return res.status(400).json({ error: 'Invalid card UID format.' });
    }
  }

  try {
    if (!finalTokenNumber && cardUid) {
      const cachedActive = await redisService.get(`token:active:${cardUid}`);
      if (cachedActive) {
        finalTokenNumber = JSON.parse(cachedActive).tokenNumber;
      } else {
        const cardObj = await prisma.card.findUnique({
          where: { nfcUid: cardUid },
          include: { currentToken: true }
        });
        if (cardObj && cardObj.currentToken) {
          finalTokenNumber = cardObj.currentToken.tokenNumber;
        }
      }
    }

    if (!finalTokenNumber) {
      return res.status(400).json({ error: 'Token number or card UID is required' });
    }

    const summary = await tokenService.closeSession(
      finalTokenNumber,
      req.user?.id || '',
      CloseReason.CHECKOUT,
      eraseCard !== undefined ? eraseCard : true
    );

    // Format return
    const responseData = {
      message: 'Session closed successfully',
      summary: {
        tokenNumber: summary.token.tokenNumber,
        customerName: summary.token.customer.name,
        tableNumber: summary.token.table?.tableNumber || null,
        durationMinutes: summary.sessionSummary.totalTimeUsedMinutes,
        allocatedMinutes: summary.sessionSummary.timeAllocatedMinutes,
        redemptionsUsed: summary.sessionSummary.totalRedemptionsUsed,
        redemptionLimit: summary.token.totalRedemptionsAllowed,
        amountPaid: parseFloat(summary.token.amountPaid.toString()),
      }
    };

    return res.json(responseData);
  } catch (err: any) {
    console.error(err);
    if (err.code === 'CONFLICT' || err.message === 'This session has already been closed.') {
      return res.status(409).json({ error: 'This session has already been closed.' });
    }
    return res.status(400).json({ error: err.message });
  }
};

router.post('/checkout', authenticate, authorize(['receptionist', 'admin']), checkoutSessionHandler);
router.put('/tokens/:tokenNumber/close', authenticate, authorize(['receptionist', 'admin']), checkoutSessionHandler);

// Manual Close Section Route
router.post('/sessions/:tokenNumber/close', authenticate, authorize(['admin', 'receptionist', 'bartender']), async (req: AuthenticatedRequest, res: Response) => {
  const { tokenNumber } = req.params;
  const { eraseCard, force } = req.body;

  const tokenRegex = /^BAR-\d{8}-\d{5}$/;
  if (!tokenNumber || !tokenRegex.test(tokenNumber) || tokenNumber.length !== 18) {
    return res.status(400).json({ error: 'Token number must be in format BAR-YYYYMMDD-XXXXX.' });
  }

  try {
    const summary = await tokenService.closeSession(
      tokenNumber,
      req.user?.id || '',
      CloseReason.MANUAL,
      eraseCard !== undefined ? eraseCard : true,
      force === true
    );

    return res.json({
      success: true,
      message: 'Section closed successfully',
      summary: {
        tokenNumber: summary.token.tokenNumber,
        customerName: summary.token.customer.name,
        tableNumber: summary.token.table?.tableNumber || null,
        durationMinutes: summary.sessionSummary.totalTimeUsedMinutes,
        allocatedMinutes: summary.sessionSummary.timeAllocatedMinutes,
        redemptionsUsed: summary.sessionSummary.totalRedemptionsUsed,
        redemptionLimit: summary.token.totalRedemptionsAllowed,
        amountPaid: parseFloat(summary.token.amountPaid.toString()),
      }
    });
  } catch (err: any) {
    console.error(err);
    if (err.code === 'CONFLICT' || err.message === 'This session has already been closed.') {
      return res.status(409).json({ error: 'This session has already been closed.' });
    }
    return res.status(400).json({ error: err.message });
  }
});

// QR Code Assisted Close Section Route
router.post('/sessions/close-by-qr', authenticate, authorize(['admin', 'receptionist', 'bartender']), async (req: AuthenticatedRequest, res: Response) => {
  const { qrData, eraseCard } = req.body;

  if (!qrData) {
    return res.status(400).json({ error: 'QR data is required.' });
  }

  // Direct token validation
  const tokenNumber = qrData;

  const tokenRegex = /^BAR-\d{8}-\d{5}$/;
  if (!tokenRegex.test(tokenNumber) || tokenNumber.length !== 18) {
    return res.status(400).json({ error: 'Scanned QR does not contain a valid token number.' });
  }

  try {
    // 1. Validation Checks before closing
    const token = await prisma.token.findUnique({
      where: { tokenNumber },
      include: { table: true }
    });

    if (!token) {
      return res.status(404).json({ error: 'Token not found.' });
    }

    if (token.status === TokenStatus.CLOSED) {
      return res.status(409).json({ error: 'This session has already been closed.' });
    }

    if (token.deliveryMode === 'EMAIL_QR' && !token.paymentVerified) {
      return res.status(400).json({ error: 'Cannot close an unpaid pending QR session.' });
    }

    if (token.status !== TokenStatus.ACTIVE && token.status !== TokenStatus.EXTENDED && token.status !== TokenStatus.EXPIRED) {
      return res.status(400).json({ error: `Cannot close token with status: ${token.status}` });
    }

    // Verify section is currently occupied
    const table = token.table;
    if (!table || table.status !== 'occupied') {
      return res.status(400).json({ error: 'Assigned table/section is not currently marked occupied.' });
    }

    // 2. Perform closure using centralized service
    const summary = await tokenService.closeSession(
      tokenNumber,
      req.user?.id || '',
      CloseReason.QR_SCAN,
      eraseCard !== undefined ? eraseCard : true
    );

    return res.json({
      success: true,
      message: 'Section successfully closed via QR scan',
      summary: {
        tokenNumber: summary.token.tokenNumber,
        customerName: summary.token.customer.name,
        tableNumber: summary.token.table?.tableNumber || null,
        durationMinutes: summary.sessionSummary.totalTimeUsedMinutes,
        allocatedMinutes: summary.sessionSummary.timeAllocatedMinutes,
        redemptionsUsed: summary.sessionSummary.totalRedemptionsUsed,
        redemptionLimit: summary.token.totalRedemptionsAllowed,
        amountPaid: parseFloat(summary.token.amountPaid.toString()),
      }
    });
  } catch (err: any) {
    console.error(err);
    if (err.code === 'CONFLICT' || err.message === 'This session has already been closed.') {
      return res.status(409).json({ error: 'This session has already been closed.' });
    }
    return res.status(400).json({ error: err.message });
  }
});

// ==========================================
// 4. BARTENDER / REDEMPTION ENDPOINTS
// ==========================================

// Validate Token Card (GET)
router.get('/token/validate/:cardUid', authenticate, authorize(['bartender', 'admin']), async (req: Request, res: Response) => {
  const { cardUid } = req.params;
  try {
    const token = await prisma.token.findFirst({
      where: { card: { nfcUid: cardUid }, status: { in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED] } },
      include: { table: true, customer: true, placeType: true }
    }) as any;

    if (!token) {
      return res.status(404).json({ error: 'No active session token found for this card' });
    }

    // Validate expiration
    const now = new Date();
    if (now > token.endTime) {
      return res.status(400).json({
        error: 'Token session has expired',
        expiredAt: token.endTime,
        token: {
          tokenNumber: token.tokenNumber,
          customerName: token.customer.name,
        }
      });
    }

    // Validate redemption limits
    if (token.redemptionsUsed >= token.totalRedemptionsAllowed) {
      return res.status(400).json({
        error: 'Redemption limit has been reached',
        limit: token.totalRedemptionsAllowed,
        token: {
          tokenNumber: token.tokenNumber,
          customerName: token.customer.name,
        }
      });
    }

    // Match the old shape that React Native expect
    const compatToken = {
      id: token.id,
      tokenNumber: token.tokenNumber,
      phoneNumber: token.customer.phoneNumber,
      customerName: token.customer.name,
      persons: token.personsCount,
      placeType: token.placeType.name,
      tableId: token.tableId,
      tableNumber: token.table?.tableNumber || null,
      amountPaid: token.amountPaid,
      startTime: token.startTime.toISOString(),
      endTime: token.endTime.toISOString(),
      redemptionLimit: token.totalRedemptionsAllowed,
      redemptionCount: token.redemptionsUsed,
      status: token.status.toUpperCase(),
      cardUid,
    };

    return res.json({
      valid: true,
      remaining: token.totalRedemptionsAllowed - token.redemptionsUsed,
      token: compatToken,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to validate card' });
  }
});

// Process Redemption
const redeemHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenNumber, cardUid } = req.body;
  if (tokenNumber) {
    const tokenRegex = /^BAR-\d{8}-\d{5}$/;
    if (!tokenRegex.test(tokenNumber) || tokenNumber.length !== 18) {
      return res.status(400).json({ error: 'Token number must be exactly 18 characters in format BAR-YYYYMMDD-XXXXX.' });
    }
  }
  if (cardUid) {
    const cardUidRegex = /^[A-Z0-9-]{4,50}$/;
    if (!cardUidRegex.test(cardUid)) {
      return res.status(400).json({ error: 'Invalid card UID format.' });
    }
  }

  let finalTokenNumber = tokenNumber;
  try {
    if (!finalTokenNumber && cardUid) {
      const cachedActive = await redisService.get(`token:active:${cardUid}`);
      if (cachedActive) {
        finalTokenNumber = JSON.parse(cachedActive).tokenNumber;
      } else {
        const cardObj = await prisma.card.findUnique({
          where: { nfcUid: cardUid },
          include: { currentToken: true }
        });
        if (cardObj && cardObj.currentToken) {
          finalTokenNumber = cardObj.currentToken.tokenNumber;
        }
      }
    }

    if (!finalTokenNumber) {
      return res.status(404).json({ error: 'No active session found' });
    }

    const bartenderId = req.user?.id || req.body.bartenderId || '';
    if (bartenderId && !isValidUUID(bartenderId)) {
      return res.status(400).json({ error: 'Invalid bartenderId UUID format.' });
    }
    const tokenRecord = await prisma.token.findUnique({ where: { tokenNumber: finalTokenNumber } });
    const presentationType = tokenRecord && tokenRecord.deliveryMode === 'EMAIL_QR' ? 'QR_SCAN' : 'NFC_TAP';
    const result = await redemptionService.processRedemption(finalTokenNumber, bartenderId, undefined, presentationType);

    // compat old return shape
    return res.json({
      success: true,
      message: 'Redemption recorded successfully',
      redemptionCount: result.redemption.token?.redemptionsUsed || result.redemption.redemptionSequence,
      redemptionLimit: result.redemption.token?.totalRedemptionsAllowed,
      remaining: result.remainingRedemptions,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};

const undoRedeemHandler = async (req: AuthenticatedRequest, res: Response) => {
  const { tokenNumber, cardUid } = req.body;
  if (tokenNumber) {
    const tokenRegex = /^BAR-\d{8}-\d{5}$/;
    if (!tokenRegex.test(tokenNumber) || tokenNumber.length !== 18) {
      return res.status(400).json({ error: 'Token number must be exactly 18 characters in format BAR-YYYYMMDD-XXXXX.' });
    }
  }
  if (cardUid) {
    const cardUidRegex = /^[A-Z0-9-]{4,50}$/;
    if (!cardUidRegex.test(cardUid)) {
      return res.status(400).json({ error: 'Invalid card UID format.' });
    }
  }

  let finalTokenNumber = tokenNumber;
  try {
    if (!finalTokenNumber && cardUid) {
      const cachedActive = await redisService.get(`token:active:${cardUid}`);
      if (cachedActive) {
        finalTokenNumber = JSON.parse(cachedActive).tokenNumber;
      } else {
        const cardObj = await prisma.card.findUnique({
          where: { nfcUid: cardUid },
          include: { currentToken: true }
        });
        if (cardObj && cardObj.currentToken) {
          finalTokenNumber = cardObj.currentToken.tokenNumber;
        }
      }
    }

    if (!finalTokenNumber) {
      return res.status(404).json({ error: 'No active session found' });
    }

    const result = await redemptionService.undoRedemption(finalTokenNumber);

    return res.json({
      success: true,
      message: 'Redemption undone successfully',
      redemptionCount: result.redemption.token?.redemptionsUsed || result.redemption.redemptionSequence - 1,
      redemptionLimit: result.redemption.token?.totalRedemptionsAllowed,
      remaining: result.remainingRedemptions,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(400).json({ error: err.message });
  }
};

router.post('/token/redeem', authenticate, authorize(['bartender', 'admin']), redeemHandler);
router.post('/redemptions/tap', authenticate, authorize(['bartender', 'admin']), redeemHandler);
router.post('/token/redeem/undo', authenticate, authorize(['bartender', 'admin']), undoRedeemHandler);
router.post('/redemptions/tap/undo', authenticate, authorize(['bartender', 'admin']), undoRedeemHandler);

// Get redemptions
router.get('/tokens/:tokenNumber/redemptions', authenticate, async (req: Request, res: Response) => {
  const { tokenNumber } = req.params;
  try {
    const token = await prisma.token.findUnique({ where: { tokenNumber } });
    if (!token) return res.status(404).json({ error: 'Token not found' });
    
    const redemptions = await prisma.redemption.findMany({
      where: { tokenId: token.id },
      include: { bartender: true },
      orderBy: { redemptionSequence: 'asc' }
    });

    return res.json(redemptions.map(r => ({
      id: r.id,
      tokenId: r.tokenId,
      bartenderId: r.bartenderId,
      bartenderName: r.bartender.fullName,
      timestamp: r.redeemedAt.toISOString()
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. CARD INVENTORY ENDPOINTS
// ==========================================

// Get all cards (Admin Only)
router.get('/cards', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const cards = await prisma.card.findMany({
      orderBy: { nfcUid: 'asc' }
    });
    return res.json(cards.map(c => ({
      id: c.id,
      cardUid: c.nfcUid,
      status: c.status.toLowerCase(),
      writeCycles: c.writeCycles,
      lastWrittenAt: c.lastWrittenAt,
      assignedAt: c.assignedAt
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Get available cards
router.get('/cards/available', authenticate, async (req: Request, res: Response) => {
  try {
    const cards = await prisma.card.findMany({
      where: { status: 'available' }
    });
    return res.json(cards.map(c => ({
      id: c.id,
      cardUid: c.nfcUid,
      status: c.status.toUpperCase(),
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Register Card
router.post('/cards/register', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  const { nfcUid, status } = req.body;
  try {
    const card = await prisma.card.create({
      data: {
        nfcUid,
        status: status || 'available',
      }
    });
    return res.status(201).json(card);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Update card status (e.g. mark lost) - PUT /api/cards/:cardUid
const updateCardStatusHandler = async (req: Request, res: Response) => {
  const { cardUid } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: { code: 'VAL_ERR', message: 'Status is required' } });
  }

  const requestedStatus = status.toLowerCase();
  const allowedStatuses = ['available', 'assigned', 'lost', 'damaged', 'inactive'];
  if (!allowedStatuses.includes(requestedStatus)) {
    return res.status(400).json({
      error: {
        code: 'VAL_ERR',
        message: 'Invalid status. Allowed statuses are available, assigned, lost, damaged, inactive.'
      }
    });
  }

  try {
    const existingCard = await prisma.card.findUnique({
      where: { nfcUid: cardUid }
    });

    if (!existingCard) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Card not found' } });
    }

    const currentStatus = existingCard.status.toLowerCase();

    // Rule 1: Assigned cards cannot be marked available without checkout
    if (currentStatus === 'assigned' && requestedStatus === 'available') {
      return res.status(400).json({
        error: {
          code: 'CONFLICT_CARD_ASSIGNED',
          message: 'Assigned cards cannot be marked available directly without closing the session.'
        }
      });
    }

    // Rule 2: Lost cards cannot be assigned directly
    if (currentStatus === 'lost' && requestedStatus === 'assigned') {
      return res.status(400).json({
        error: {
          code: 'CONFLICT_CARD_LOST',
          message: 'Lost cards cannot be assigned directly without marking them available first.'
        }
      });
    }

    // Rule 3: Damaged cards cannot be assigned directly
    if (currentStatus === 'damaged' && requestedStatus === 'assigned') {
      return res.status(400).json({
        error: {
          code: 'CONFLICT_CARD_DAMAGED',
          message: 'Damaged cards cannot be assigned directly without marking them available first.'
        }
      });
    }

    const card = await prisma.card.update({
      where: { nfcUid: cardUid },
      data: { status: requestedStatus }
    });

    // Invalidate available table cache
    await redisService.del('table:available:all');
    await redisService.del(`card:${cardUid}:status`);

    return res.json({
      id: card.id,
      cardUid: card.nfcUid,
      status: card.status.toUpperCase()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

router.put('/cards/:cardUid', authenticate, authorize(['admin']), updateCardStatusHandler);
router.put('/cards/:cardUid/status', authenticate, authorize(['admin']), updateCardStatusHandler);

// ==========================================
// 6. CUSTOMERS ENDPOINTS
// ==========================================

router.post('/customers', authenticate, async (req: Request, res: Response) => {
  const { phoneNumber, name, email } = req.body;

  const phoneRegex = /^(?:\+91)?[6-9]\d{9}$/;
  if (!phoneNumber || !phoneRegex.test(phoneNumber)) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit Indian phone number starting with 6-9.' });
  }
  const finalPhoneNumber = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

  const nameRegex = /^[a-zA-Z\s.'-]{2,100}$/;
  if (!name || !nameRegex.test(name)) {
    return res.status(400).json({ error: 'Customer name must contain only letters, spaces, periods, apostrophes, or hyphens (2-100 characters).' });
  }

  if (email && email.trim()) {
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid Gmail address using only lowercase letters, numbers, and dots.' });
    }
  }
  let finalEmail = email ? email.trim().toLowerCase() : null;

  try {
    let customer = await prisma.customer.findUnique({ where: { phoneNumber: finalPhoneNumber } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { phoneNumber: finalPhoneNumber, name, email: finalEmail || null }
      });
    }
    return res.json({ success: true, data: { customer } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/customers/:phoneNumber', authenticate, async (req: Request, res: Response) => {
  const { phoneNumber } = req.params;
  const searchPhone = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;
  try {
    const customer = await prisma.customer.findUnique({
      where: { phoneNumber: searchPhone },
      include: {
        tokens: {
          where: { status: { in: [TokenStatus.ACTIVE, TokenStatus.EXTENDED, TokenStatus.EXPIRED] } },
          take: 1
        }
      }
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    return res.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          phoneNumber: customer.phoneNumber,
          name: customer.name,
          email: customer.email,
          totalVisits: customer.totalVisits,
          lastVisit: customer.lastVisit,
          activeToken: customer.tokens[0] || null
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. RATE CARDS ENDPOINTS
// ==========================================

router.get('/rate-card', authenticate, async (req: Request, res: Response) => {
  try {
    const rates = await prisma.placeTypeConfig.findMany();
    // format response for compatibility
    return res.json(rates.map(r => ({
      id: r.id,
      placeType: r.name,
      ratePerPerson: Number(r.ratePerPerson),
      baseDurationHours: Math.round(r.baseTimeMinutes / 60),
      maxDrinksPerPerson: r.redemptionsPerPerson,
    })));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

const updateRateCardHandler = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, placeType, ratePerPerson, baseTimeMinutes, baseDurationHours, redemptionsPerPerson, maxDrinksPerPerson, changedBy } = req.body;
  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid rate-card placeType ID UUID format.' } });
  }
  if (changedBy && !isValidUUID(changedBy)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_UUID', message: 'Invalid changedBy UUID format.' } });
  }

  const finalPlaceType = (name || placeType || '').trim();
  const finalRate = ratePerPerson !== undefined ? new Decimal(ratePerPerson) : undefined;
  const finalMinutes = baseTimeMinutes ? parseInt(baseTimeMinutes, 10) : (baseDurationHours ? parseInt(baseDurationHours, 10) * 60 : undefined);
  const finalRedemptions = redemptionsPerPerson ? parseInt(redemptionsPerPerson, 10) : (maxDrinksPerPerson ? parseInt(maxDrinksPerPerson, 10) : undefined);

  if (finalPlaceType !== '' && finalPlaceType !== 'STANDING_BAR' && finalPlaceType !== 'PREMIUM_LOUNGE') {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Place type must be either STANDING_BAR or PREMIUM_LOUNGE.' } });
  }
  if (finalRate !== undefined && (finalRate.isNaN() || finalRate.lt(0))) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Rate per person must be a non-negative number.' } });
  }
  if (finalMinutes !== undefined && (isNaN(finalMinutes) || finalMinutes < 30 || finalMinutes > 1440)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Base duration must be between 30 minutes and 24 hours.' } });
  }
  if (finalRedemptions !== undefined && (isNaN(finalRedemptions) || finalRedemptions < 0 || finalRedemptions > 50)) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: 'Drinks allotment must be between 0 and 50.' } });
  }

  try {
    let createdRateLog: any = null;
    const pt = await prisma.$transaction(async (tx) => {
      const oldPT = await tx.placeTypeConfig.findUnique({ where: { id } });
      if (!oldPT) throw new Error('Rate card not found');

      if (finalPlaceType !== '' && finalPlaceType.toLowerCase() !== oldPT.name.toLowerCase()) {
        const existing = await tx.placeTypeConfig.findFirst({
          where: { name: { equals: finalPlaceType, mode: 'insensitive' } }
        });
        if (existing) {
          throw new Error('Place type name is already taken');
        }
      }

      const updated = await tx.placeTypeConfig.update({
        where: { id },
        data: {
          name: finalPlaceType || oldPT.name,
          ratePerPerson: finalRate !== undefined ? finalRate : oldPT.ratePerPerson,
          baseTimeMinutes: finalMinutes !== undefined ? finalMinutes : oldPT.baseTimeMinutes,
          redemptionsPerPerson: finalRedemptions !== undefined ? finalRedemptions : oldPT.redemptionsPerPerson,
        }
      });

      createdRateLog = await tx.rateLog.create({
        data: {
          placeTypeId: id,
          oldRate: oldPT.ratePerPerson,
          newRate: finalRate !== undefined ? finalRate : oldPT.ratePerPerson,
          changedBy: changedBy || (req as AuthenticatedRequest).user?.id || '',
        }
      });

      return updated;
    });

    if (createdRateLog) {
      try {
        await s3Service.uploadAuditLog('rate-changes', createdRateLog.id, createdRateLog);
      } catch (s3Err) {
        console.error('[S3 Rate Change Log Archiver Error]:', s3Err);
      }
    }

    return res.json({
      id: pt.id,
      placeType: pt.name,
      ratePerPerson: Number(pt.ratePerPerson),
      baseDurationHours: Math.round(pt.baseTimeMinutes / 60),
      maxDrinksPerPerson: pt.redemptionsPerPerson,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { code: 'VAL_ERR', message: err.message } });
  }
};

router.put('/rate-card/:id', authenticate, authorize(['admin']), updateRateCardHandler);
router.put('/rate-cards/:id', authenticate, authorize(['admin']), updateRateCardHandler);

// Admin list rate-cards
router.get('/rate-cards', authenticate, async (req: Request, res: Response) => {
  try {
    const rates = await prisma.placeTypeConfig.findMany();
    return res.json({
      success: true,
      data: { placeTypes: rates }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. ADMIN REPORTS ENDPOINTS
// ==========================================

function getDateRangeFromFilter(filter?: string, queryStart?: string, queryEnd?: string) {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  if (filter === 'hour') {
    startDate = new Date(now.getTime() - 60 * 60 * 1000);
    endDate = now;
  } else if (filter === 'day') {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  } else if (filter === 'week') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    endDate = now;
  } else if (filter === 'month') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    endDate = now;
  } else if (filter === 'custom' || (!filter && queryStart)) {
    if (queryStart) {
      startDate = new Date(queryStart);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate.setHours(0, 0, 0, 0);
    }
    if (queryEnd) {
      endDate = new Date(queryEnd);
      endDate.setHours(23, 59, 59, 999);
    } else {
      endDate = now;
    }
  } else {
    // Default to 'day' (today)
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

// GET /reports/dashboard
router.get('/reports/dashboard', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    await tokenService.reconcileSystemState();
    const { filter, startDate: qStart, endDate: qEnd } = req.query;
    const { startDate, endDate } = getDateRangeFromFilter(filter as string, qStart as string, qEnd as string);

    // 1. Sales summary query
    const tokens = await prisma.token.findMany({
      where: { 
        startTime: { gte: startDate, lte: endDate },
        paymentVerified: true
      },
    });

    const totalCollectionsDec = tokens.reduce((acc, t) => acc.add(t.amountPaid), new Decimal(0));
    const totalCollections = totalCollectionsDec.toNumber();
    const totalPersonsServed = tokens.reduce((acc, t) => acc + t.personsCount, 0);

    const redemptionsCount = await prisma.redemption.count({
      where: { redeemedAt: { gte: startDate, lte: endDate } },
    });

    const salesSummary = {
      todaySales: totalCollections,
      todayRedemptions: redemptionsCount,
      totalCustomers: totalPersonsServed,
      checkoutCount: tokens.filter((t: any) => t.status === TokenStatus.CLOSED).length,
      period: { startDate, endDate }
    };

    // 2. Table utilization query
    const tables = await prisma.table.findMany({
      include: { placeType: true }
    });

    const periodDurationMs = Math.max(1000, endDate.getTime() - startDate.getTime());
    const periodHours = periodDurationMs / (3600 * 1000);
    const periodDays = Math.max(1, periodHours / 24);

    let totalOccupancyHoursSum = 0;
    const tablesReport = [];

    for (const t of tables) {
      const logs = await prisma.tableOccupancyLog.findMany({
        where: {
          tableId: t.id,
          occupiedAt: { lte: endDate },
          OR: [
            { vacatedAt: null },
            { vacatedAt: { gte: startDate } }
          ]
        }
      });

      let totalOccupancyMs = 0;
      let turnoverCount = 0;
      let sessionDurationsSum = 0;
      let finishedSessionsCount = 0;

      for (const log of logs) {
        const logStart = log.occupiedAt.getTime();
        const logEnd = log.vacatedAt ? log.vacatedAt.getTime() : Date.now();
        const overlapStart = Math.max(logStart, startDate.getTime());
        const overlapEnd = Math.min(logEnd, endDate.getTime());

        if (overlapStart < overlapEnd) {
          totalOccupancyMs += (overlapEnd - overlapStart);
        }

        if (logStart >= startDate.getTime() && logStart <= endDate.getTime()) {
          turnoverCount++;
        }

        const duration = logEnd - logStart;
        sessionDurationsSum += duration;
        finishedSessionsCount++;
      }

      const totalOccupancyHours = Number((totalOccupancyMs / (3600 * 1000)).toFixed(2));
      totalOccupancyHoursSum += totalOccupancyHours;

      const averageOccupancyPerDay = Number((totalOccupancyHours / periodDays).toFixed(2));
      const averageSessionDurationMinutes = finishedSessionsCount > 0
        ? Number((sessionDurationsSum / (finishedSessionsCount * 60 * 1000)).toFixed(2))
        : 0;

      tablesReport.push({
        tableNumber: t.tableNumber,
        placeType: t.placeType.name,
        totalOccupancyHours,
        averageOccupancyPerDay,
        turnoverCount,
        averageSessionDurationMinutes
      });
    }

    const totalTableHours = Number((periodHours * tables.length).toFixed(2));
    const averageOccupancyRate = totalTableHours > 0
      ? Number((totalOccupancyHoursSum / totalTableHours).toFixed(4))
      : 0;

    const tableUtilization = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      tables: tablesReport,
      summary: {
        totalTableHours,
        averageOccupancyRate: Math.min(1.0, averageOccupancyRate)
      }
    };

    // 3. Hourly breakdown query
    const redemptions = await prisma.redemption.findMany({
      where: { redeemedAt: { gte: startDate, lte: endDate } }
    });

    const activeTokens = await prisma.token.findMany({
      where: {
        startTime: { lte: endDate },
        paymentVerified: true,
        OR: [
          { closedAt: null },
          { closedAt: { gte: startDate } }
        ]
      }
    });

    const hourlyCounts: number[] = new Array(24).fill(0);
    const hourlyData = [];
    const dateStr = startDate.getFullYear() + '-' + String(startDate.getMonth() + 1).padStart(2, '0') + '-' + String(startDate.getDate()).padStart(2, '0');

    for (let hour = 0; hour < 24; hour++) {
      const hrRedemptions = redemptions.filter(r => new Date(r.redeemedAt).getHours() === hour).length;
      hourlyCounts[hour] = hrRedemptions;

      const hrNewTokens = activeTokens.filter(t => new Date(t.startTime).getHours() === hour && t.startTime.getTime() >= startDate.getTime() && t.startTime.getTime() <= endDate.getTime()).length;

      let activeTokensSum = 0;
      const dayStart = new Date(startDate);
      dayStart.setHours(0, 0, 0, 0);
      let dayCount = 0;

      while (dayStart.getTime() <= endDate.getTime()) {
        const hrStart = new Date(dayStart);
        hrStart.setHours(hour, 0, 0, 0);
        const hrEnd = new Date(dayStart);
        hrEnd.setHours(hour, 59, 59, 999);

        const activeCount = activeTokens.filter(t => {
          const tStart = t.startTime.getTime();
          const tEnd = t.closedAt ? t.closedAt.getTime() : Date.now();
          return tStart <= hrEnd.getTime() && tEnd >= hrStart.getTime();
        }).length;

        activeTokensSum += activeCount;
        dayCount++;

        dayStart.setDate(dayStart.getDate() + 1);
      }

      const averageActiveTokens = dayCount > 0 ? Number((activeTokensSum / dayCount).toFixed(1)) : 0;

      hourlyData.push({
        hour,
        redemptions: hrRedemptions,
        newTokens: hrNewTokens,
        activeTokens: averageActiveTokens
      });
    }

    let peakHour = 0;
    let peakRedemptions = 0;
    for (let hour = 0; hour < 24; hour++) {
      if (hourlyCounts[hour] > peakRedemptions) {
        peakRedemptions = hourlyCounts[hour];
        peakHour = hour;
      }
    }

    if (peakRedemptions === 0) {
      let maxNew = 0;
      for (let i = 0; i < 24; i++) {
        if (hourlyData[i].newTokens > maxNew) {
          maxNew = hourlyData[i].newTokens;
          peakHour = i;
        }
      }
    }

    const hourlyBreakdown = {
      date: dateStr,
      hourlyData,
      peakHour,
      peakRedemptions
    };

    return res.json({
      success: true,
      data: {
        salesSummary,
        tableUtilization,
        hourlyBreakdown
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Sales summary
router.get('/reports/sales', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { filter, startDate: qStart, endDate: qEnd } = req.query;
    const { startDate, endDate } = getDateRangeFromFilter(filter as string, qStart as string, qEnd as string);

    const tokens = await prisma.token.findMany({
      where: { 
        startTime: { gte: startDate, lte: endDate },
        paymentVerified: true
      },
    });

    const totalCollectionsDec = tokens.reduce((acc, t) => acc.add(t.amountPaid), new Decimal(0));
    const totalCollections = totalCollectionsDec.toNumber();
    const totalPersonsServed = tokens.reduce((acc, t) => acc + t.personsCount, 0);

    const redemptionsCount = await prisma.redemption.count({
      where: { redeemedAt: { gte: startDate, lte: endDate } },
    });

    return res.json({
      success: true,
      todaySales: totalCollections,
      todayRedemptions: redemptionsCount,
      totalCustomers: totalPersonsServed,
      checkoutCount: tokens.filter((t: any) => t.status === TokenStatus.CLOSED).length,
      data: {
        todaySales: totalCollections,
        todayRedemptions: redemptionsCount,
        totalCustomers: totalPersonsServed,
        checkoutCount: tokens.filter((t: any) => t.status === TokenStatus.CLOSED).length,
        period: { startDate, endDate }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Occupancy report
router.get('/reports/occupancy', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const tables = await prisma.table.findMany();
    const occupiedCount = tables.filter(t => t.status === 'occupied').length;
    const totalCount = tables.length;
    const occupancyRate = totalCount > 0 ? (occupiedCount / totalCount) * 100 : 0;

    return res.json({
      success: true,
      totalTables: totalCount,
      occupiedTables: occupiedCount,
      occupancyRate: Math.round(occupancyRate),
      tables: tables.map(t => ({
        id: t.id,
        number: t.tableNumber,
        placeType: t.placeTypeId,
        status: t.status.toUpperCase(),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Peak hours
router.get('/reports/peak-hours', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { filter, startDate: qStart, endDate: qEnd } = req.query;
    const { startDate, endDate } = getDateRangeFromFilter(filter as string, qStart as string, qEnd as string);

    const redemptions = await prisma.redemption.findMany({
      where: { redeemedAt: { gte: startDate, lte: endDate } },
      select: { redeemedAt: true },
    });

    const hourlyCounts = Array(24).fill(0);
    redemptions.forEach((r) => {
      const hour = new Date(r.redeemedAt).getHours();
      hourlyCounts[hour]++;
    });

    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    return res.json({
      success: true,
      labels,
      data: hourlyCounts,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Cards inventory report
router.get('/reports/cards', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const cards = await prisma.card.findMany();
    const activeCount = cards.filter(c => c.status === 'available').length;
    const assignedCount = cards.filter(c => c.status === 'assigned').length;
    const lostCount = cards.filter(c => c.status === 'lost').length;
    const damagedCount = cards.filter(c => c.status === 'damaged').length;

    return res.json({
      success: true,
      total: cards.length,
      active: activeCount,
      assigned: assignedCount,
      lost: lostCount,
      damaged: damagedCount,
      cards: cards.map(c => ({
        id: c.id,
        cardUid: c.nfcUid,
        status: c.status.toUpperCase(),
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /reports/daily
router.get('/reports/daily', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { date, filter, startDate: qStart, endDate: qEnd } = req.query;
    let startDate: Date;
    let endDate: Date;
    let dateStr = '';
    if (date) {
      dateStr = date as string;
      startDate = new Date(`${dateStr}T00:00:00`);
      endDate = new Date(`${dateStr}T23:59:59.999`);
    } else {
      const range = getDateRangeFromFilter(filter as string, qStart as string, qEnd as string);
      startDate = range.startDate;
      endDate = range.endDate;
      dateStr = startDate.getFullYear() + '-' + String(startDate.getMonth() + 1).padStart(2, '0') + '-' + String(startDate.getDate()).padStart(2, '0');
    }

    const tokens = await prisma.token.findMany({
      where: { 
        startTime: { gte: startDate, lte: endDate },
        paymentVerified: true
      },
      include: { placeType: true }
    });

    const redemptions = await prisma.redemption.findMany({
      where: { redeemedAt: { gte: startDate, lte: endDate } },
      include: { token: { include: { placeType: true } } }
    });

    const totalRevenueDec = tokens.reduce((sum, t) => sum.add(t.amountPaid), new Decimal(0));
    const totalRevenue = totalRevenueDec.toNumber();
    const totalRedemptions = redemptions.length;
    const averageRedemptionsPerToken = tokens.length > 0 ? Number((totalRedemptions / tokens.length).toFixed(1)) : 0;

    const byPlaceType: Record<string, any> = {};
    const placeTypes = await prisma.placeTypeConfig.findMany();
    for (const pt of placeTypes) {
      const ptTokens = tokens.filter(t => t.placeTypeId === pt.id);
      const ptRedemptions = redemptions.filter(r => r.token.placeTypeId === pt.id);
      const ptRevenueDec = ptTokens.reduce((sum, t) => sum.add(t.amountPaid), new Decimal(0));

      const logs = await prisma.tableOccupancyLog.findMany({
        where: {
          table: { placeTypeId: pt.id },
          occupiedAt: { lte: endDate },
          OR: [
            { vacatedAt: null },
            { vacatedAt: { gte: startDate } }
          ]
        }
      });

      let totalOccupancyMs = 0;
      for (const log of logs) {
        const logStart = log.occupiedAt.getTime();
        const logEnd = log.vacatedAt ? log.vacatedAt.getTime() : Date.now();
        const overlapStart = Math.max(logStart, startDate.getTime());
        const overlapEnd = Math.min(logEnd, endDate.getTime());
        if (overlapStart < overlapEnd) {
          totalOccupancyMs += (overlapEnd - overlapStart);
        }
      }

      const periodDurationMs = Math.max(1000, endDate.getTime() - startDate.getTime());
      const periodHours = periodDurationMs / (3600 * 1000);
      const averageOccupancy = periodHours > 0 ? Number((totalOccupancyMs / (periodHours * 3600 * 1000)).toFixed(1)) : 0;

      byPlaceType[pt.name] = {
        tokensIssued: ptTokens.length,
        revenue: ptRevenueDec.toNumber(),
        redemptions: ptRedemptions.length,
        averageOccupancy: averageOccupancy
      };
    }

    return res.json({
      success: true,
      data: {
        date: dateStr,
        summary: {
          totalTokensIssued: tokens.length,
          totalRevenue,
          totalRedemptions,
          averageRedemptionsPerToken
        },
        byPlaceType
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /reports/table-utilization
router.get('/reports/table-utilization', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { filter, startDate: qStart, endDate: qEnd, placeTypeId } = req.query;
    const { startDate, endDate } = getDateRangeFromFilter(filter as string, qStart as string, qEnd as string);

    const tableWhereClause: any = {};
    if (placeTypeId) {
      tableWhereClause.placeTypeId = placeTypeId as string;
    }
    const tables = await prisma.table.findMany({
      where: tableWhereClause,
      include: { placeType: true }
    });

    const periodDurationMs = Math.max(1000, endDate.getTime() - startDate.getTime());
    const periodHours = periodDurationMs / (3600 * 1000);
    const periodDays = Math.max(1, periodHours / 24);

    let totalOccupancyHoursSum = 0;
    const tablesReport = [];

    for (const t of tables) {
      const logs = await prisma.tableOccupancyLog.findMany({
        where: {
          tableId: t.id,
          occupiedAt: { lte: endDate },
          OR: [
            { vacatedAt: null },
            { vacatedAt: { gte: startDate } }
          ]
        }
      });

      let totalOccupancyMs = 0;
      let turnoverCount = 0;
      let sessionDurationsSum = 0;
      let finishedSessionsCount = 0;

      for (const log of logs) {
        const logStart = log.occupiedAt.getTime();
        const logEnd = log.vacatedAt ? log.vacatedAt.getTime() : Date.now();
        const overlapStart = Math.max(logStart, startDate.getTime());
        const overlapEnd = Math.min(logEnd, endDate.getTime());

        if (overlapStart < overlapEnd) {
          totalOccupancyMs += (overlapEnd - overlapStart);
        }

        if (logStart >= startDate.getTime() && logStart <= endDate.getTime()) {
          turnoverCount++;
        }

        const duration = logEnd - logStart;
        sessionDurationsSum += duration;
        finishedSessionsCount++;
      }

      const totalOccupancyHours = Number((totalOccupancyMs / (3600 * 1000)).toFixed(2));
      totalOccupancyHoursSum += totalOccupancyHours;

      const averageOccupancyPerDay = Number((totalOccupancyHours / periodDays).toFixed(2));
      const averageSessionDurationMinutes = finishedSessionsCount > 0
        ? Number((sessionDurationsSum / (finishedSessionsCount * 60 * 1000)).toFixed(2))
        : 0;

      tablesReport.push({
        tableNumber: t.tableNumber,
        placeType: t.placeType.name,
        totalOccupancyHours,
        averageOccupancyPerDay,
        turnoverCount,
        averageSessionDurationMinutes
      });
    }

    const totalTableHours = Number((periodHours * tables.length).toFixed(2));
    const averageOccupancyRate = totalTableHours > 0
      ? Number((totalOccupancyHoursSum / totalTableHours).toFixed(4))
      : 0;

    return res.json({
      success: true,
      data: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        tables: tablesReport,
        summary: {
          totalTableHours,
          averageOccupancyRate: Math.min(1.0, averageOccupancyRate)
        }
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /reports/hourly-breakdown
router.get('/reports/hourly-breakdown', authenticate, authorize(['admin']), async (req: Request, res: Response) => {
  try {
    const { date, filter, startDate: qStart, endDate: qEnd } = req.query;
    let startDate: Date;
    let endDate: Date;
    let dateStr = '';
    if (date) {
      dateStr = date as string;
      startDate = new Date(`${dateStr}T00:00:00`);
      endDate = new Date(`${dateStr}T23:59:59.999`);
    } else {
      const range = getDateRangeFromFilter(filter as string, qStart as string, qEnd as string);
      startDate = range.startDate;
      endDate = range.endDate;
      dateStr = startDate.getFullYear() + '-' + String(startDate.getMonth() + 1).padStart(2, '0') + '-' + String(startDate.getDate()).padStart(2, '0');
    }

    const hourlyData = [];
    const hourlyCounts = Array(24).fill(0);

    const redemptions = await prisma.redemption.findMany({
      where: { redeemedAt: { gte: startDate, lte: endDate } }
    });

    const tokens = await prisma.token.findMany({
      where: {
        startTime: { lte: endDate },
        paymentVerified: true,
        OR: [
          { closedAt: null },
          { closedAt: { gte: startDate } }
        ]
      }
    });

    for (let hour = 0; hour < 24; hour++) {
      const hrRedemptions = redemptions.filter(r => new Date(r.redeemedAt).getHours() === hour).length;
      hourlyCounts[hour] = hrRedemptions;

      const hrNewTokens = tokens.filter(t => new Date(t.startTime).getHours() === hour && t.startTime.getTime() >= startDate.getTime() && t.startTime.getTime() <= endDate.getTime()).length;

      let activeTokensSum = 0;
      const dayStart = new Date(startDate);
      dayStart.setHours(0, 0, 0, 0);
      let dayCount = 0;

      while (dayStart.getTime() <= endDate.getTime()) {
        const hrStart = new Date(dayStart);
        hrStart.setHours(hour, 0, 0, 0);
        const hrEnd = new Date(dayStart);
        hrEnd.setHours(hour, 59, 59, 999);

        const activeCount = tokens.filter(t => {
          const tStart = t.startTime.getTime();
          const tEnd = t.closedAt ? t.closedAt.getTime() : Date.now();
          return tStart <= hrEnd.getTime() && tEnd >= hrStart.getTime();
        }).length;

        activeTokensSum += activeCount;
        dayCount++;

        dayStart.setDate(dayStart.getDate() + 1);
      }

      const averageActiveTokens = dayCount > 0 ? Number((activeTokensSum / dayCount).toFixed(1)) : 0;

      hourlyData.push({
        hour,
        redemptions: hrRedemptions,
        newTokens: hrNewTokens,
        activeTokens: averageActiveTokens
      });
    }

    let peakHour = 0;
    let peakRedemptions = 0;
    for (let hour = 0; hour < 24; hour++) {
      if (hourlyCounts[hour] > peakRedemptions) {
        peakRedemptions = hourlyCounts[hour];
        peakHour = hour;
      }
    }

    if (peakRedemptions === 0) {
      let maxNew = 0;
      for (let i = 0; i < 24; i++) {
        if (hourlyData[i].newTokens > maxNew) {
          maxNew = hourlyData[i].newTokens;
          peakHour = i;
        }
      }
    }

    return res.json({
      success: true,
      data: {
        date: dateStr,
        hourlyData,
        peakHour,
        peakRedemptions
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Batch Sync Endpoint (Offline-First reconciliation)
router.post('/sync', authenticate, async (req: Request, res: Response) => {
  const { deviceId, operations } = req.body;

  if (!deviceId || !Array.isArray(operations)) {
    return res.status(400).json({
      success: false,
      error: { code: 'VAL_010', message: 'deviceId and operations array are required' }
    });
  }

  try {
    const results = await syncService.syncOperations(deviceId, operations);
    const processedCount = results.filter(r => r.status === 'SUCCESS').length;

    return res.json({
      success: true,
      processedCount,
      results
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'SYNC_ERR', message: err.message }
    });
  }
});

// GET /api/config (Exposes tokenType config)
router.get('/config', async (req: Request, res: Response) => {
  try {
    const { nfcEnabled, emailQrEnabled } = await tokenService.getConfiguredDeliveryAvailability();
    const tokenType = emailQrEnabled && !nfcEnabled ? 'email' : 'nfc';
    return res.json({
      success: true,
      nfcEnabled,
      emailQrEnabled,
      tokenType
    });
  } catch (err: any) {
    const tokenType = (process.env.TOKEN_TYPE || 'nfc').toLowerCase();
    return res.json({
      success: true,
      nfcEnabled: true,
      emailQrEnabled: true,
      tokenType
    });
  }
});

export default router;
