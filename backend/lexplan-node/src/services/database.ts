import mongoose from 'mongoose';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

let mongoConnection: typeof mongoose | null = null;
let redisClient: Redis | null = null;

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export async function connectMongoDB(): Promise<typeof mongoose | null> {
  if (mongoConnection) return mongoConnection;
  const uri = nonEmptyEnv('MONGODB_URI') || 'mongodb://127.0.0.1:27017/lexplan';
  try {
    mongoConnection = await mongoose.connect(uri, {
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE ?? 10),
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS ?? 3000),
    });
    logger.info('MongoDB connected', { uri: uri.includes('@') ? 'configured' : uri });
    return mongoConnection;
  } catch (error) {
    mongoConnection = null;
    logger.warn('MongoDB unavailable; LexPlan will use memory fallback until storage is available.', error);
    return null;
  }
}

export async function disconnectMongoDB(): Promise<void> {
  if (mongoConnection) {
    await mongoose.disconnect();
    mongoConnection = null;
  }
}

export function getMongoConnection(): typeof mongoose | null {
  return mongoConnection;
}

export async function connectRedis(): Promise<Redis | null> {
  if (redisClient) return redisClient;
  const url = nonEmptyEnv('REDIS_URL');
  if (!url && process.env.REDIS_OPTIONAL !== 'false') return null;
  try {
    redisClient = url ? new Redis(url) : new Redis({ host: '127.0.0.1', port: 6379 });
    await redisClient.ping();
    logger.info('Redis connected');
    return redisClient;
  } catch (error) {
    redisClient = null;
    logger.warn('Redis unavailable; async jobs will run with local process state.', error);
    return null;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

export async function initializeDatabases(): Promise<void> {
  await connectMongoDB();
  await connectRedis();
}

export async function closeDatabases(): Promise<void> {
  await disconnectRedis();
  await disconnectMongoDB();
}