import Redis from 'ioredis';

class RedisService {
  private redis: Redis | null = null;

  // In-memory storage structures for fallback mode
  private memoryCache = new Map<string, { value: string; expiresAt: number }>();
  private memoryLocks = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        console.log(`Connecting to Redis at ${redisUrl}...`);
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: null, // Recommended for ioredis reconnects
          connectTimeout: 5000,
        });

        this.redis.on('connect', () => {
          console.log('Redis connected successfully.');
        });

        this.redis.on('error', (err) => {
          console.warn('Redis connection event error:', err.message);
        });
      } catch (err: any) {
        console.warn('Failed to initialize Redis, using in-memory fallback:', err.message);
        this.redis = null;
      }
    } else {
      console.log('REDIS_URL env variable not set. Running in local in-memory mock mode.');
    }
  }

  get isConnected(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.redis) {
      try {
        return await this.redis.get(key);
      } catch (err: any) {
        console.warn(`[Redis] Get command error for key ${key}:`, err.message);
      }
    }
    
    // In-memory cache get
    const item = this.memoryCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return item.value;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    if (this.isConnected && this.redis) {
      try {
        await this.redis.setex(key, seconds, value);
        return;
      } catch (err: any) {
        console.warn(`[Redis] Setex command error for key ${key}:`, err.message);
      }
    }

    // In-memory cache set
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + seconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.redis) {
      try {
        await this.redis.del(key);
        return;
      } catch (err: any) {
        console.warn(`[Redis] Del command error for key ${key}:`, err.message);
      }
    }

    // In-memory delete
    this.memoryCache.delete(key);
    this.memoryLocks.delete(key);
  }

  async incr(key: string): Promise<number> {
    if (this.isConnected && this.redis) {
      try {
        return await this.redis.incr(key);
      } catch (err: any) {
        console.warn(`[Redis] Incr command error for key ${key}:`, err.message);
      }
    }

    // In-memory increment
    const currentStr = await this.get(key);
    const current = currentStr ? parseInt(currentStr, 10) : 0;
    const nextVal = current + 1;
    await this.setex(key, 86400, nextVal.toString()); // default TTL 24h
    return nextVal;
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    if (this.isConnected && this.redis) {
      try {
        return await this.redis.hincrby(key, field, increment);
      } catch (err: any) {
        console.warn(`[Redis] Hincrby command error for key ${key}:${field}:`, err.message);
      }
    }

    // In-memory hash increment (composite key mapping)
    const compositeKey = `${key}:${field}`;
    const currentStr = await this.get(compositeKey);
    const current = currentStr ? parseInt(currentStr, 10) : 0;
    const nextVal = current + increment;
    await this.setex(compositeKey, 86400, nextVal.toString());
    return nextVal;
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (this.isConnected && this.redis) {
      try {
        await this.redis.expire(key, seconds);
        return;
      } catch (err: any) {
        console.warn(`[Redis] Expire command error for key ${key}:`, err.message);
      }
    }

    // In-memory expire
    const item = this.memoryCache.get(key);
    if (item) {
      item.expiresAt = Date.now() + seconds * 1000;
    }
  }

  async acquireLock(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.isConnected && this.redis) {
      try {
        const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch (err: any) {
        console.warn(`[Redis] AcquireLock command error for key ${key}:`, err.message);
      }
    }

    // In-memory distributed lock acquire
    const now = Date.now();
    const existingLock = this.memoryLocks.get(key);
    if (existingLock && now < existingLock.expiresAt) {
      return false; // lock held by another process
    }

    this.memoryLocks.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
    });
    return true;
  }

  async releaseLock(key: string, value: string): Promise<void> {
    if (this.isConnected && this.redis) {
      const lua = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
      `;
      try {
        await this.redis.eval(lua, 1, key, value);
        return;
      } catch (err: any) {
        console.warn(`[Redis] ReleaseLock command error for key ${key}:`, err.message);
      }
    }

    // In-memory distributed lock release
    const existingLock = this.memoryLocks.get(key);
    if (existingLock && existingLock.value === value) {
      this.memoryLocks.delete(key);
    }
  }
}

export const redisService = new RedisService();
export default redisService;
