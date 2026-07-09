import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import router from './routes';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { tokenService } from './services/TokenService';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Configure Trust Proxy for Deployed Proxy Environments
app.set('trust proxy', 1);

// Configure Redis Store with In-Memory fallback for Rate Limiting
let rateLimitStore;
if (process.env.REDIS_URL) {
  try {
    const redisClient = new Redis(process.env.REDIS_URL);
    rateLimitStore = new RedisStore({
      // @ts-expect-error - compatibility mapping for ioredis/rate-limit-redis
      sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)),
    });
    console.log('Rate limiter: Redis store initialized successfully.');
  } catch (err) {
    console.error('Rate limiter: Failed to initialize Redis store. Falling back to MemoryStore.', err);
  }
}

// API Gateway Rate Limiter (B2 component in nfc.md)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per 15-minute window
  store: rateLimitStore,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP. Please try again after 15 minutes.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://nfc-qr-code-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:19006',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    // Check if origin is explicitly allowed
    const isAllowed = allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed));
    
    // Check if origin is a local dev address
    const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1') || origin.startsWith('chrome-extension://');
    
    if (isAllowed || isLocal) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(limiter);

// Mount API router
app.use('/api', router);

// Root route handler for status verification
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'NFC Bar Management System Backend API is running. Mount all requests on /api',
    timestamp: new Date().toISOString()
  });
});

// Production health check for monitoring (Railway Requirement)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  
  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = isProduction ? 'Internal server error occurred' : (err.message || 'Internal server error occurred');
  
  res.status(500).json({
    success: false,
    error: {
      code: 'SERVER_ERROR',
      message: errorMessage,
    },
  });
});

app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Backend server listening on port ${port}`);
});

// Periodic background system state reconciler (B3 background check)
setInterval(async () => {
  try {
    await tokenService.reconcileSystemState();
  } catch (err) {
    console.error('Background System Reconciler error:', err);
  }
}, 15000);
