import { EventEmitter } from "node:events";
import Redis from "ioredis";

const localValues = new Map();
const localTimers = new Map();
const localBus = new EventEmitter();
let client;
let subscriber;
let subscriberConnection;

const localClient = {
  async get(key) {
    return localValues.get(key) ?? null;
  },
  async set(key, value, ...options) {
    const timer = localTimers.get(key);
    if (timer) clearTimeout(timer);
    localValues.set(key, String(value));

    const expiryIndex = options.findIndex((option) => String(option).toUpperCase() === "EX");
    if (expiryIndex >= 0) {
      const seconds = Number(options[expiryIndex + 1]);
      if (Number.isFinite(seconds) && seconds > 0) {
        const expiryTimer = setTimeout(() => {
          localValues.delete(key);
          localTimers.delete(key);
        }, seconds * 1000);
        expiryTimer.unref?.();
        localTimers.set(key, expiryTimer);
      }
    }
    return "OK";
  },
  async del(...keys) {
    let deleted = 0;
    for (const key of keys) {
      const timer = localTimers.get(key);
      if (timer) clearTimeout(timer);
      localTimers.delete(key);
      if (localValues.delete(key)) deleted++;
    }
    return deleted;
  },
  async exists(key) {
    return localValues.has(key) ? 1 : 0;
  },
};

/** Lazily create the shared Redis client; use an in-memory cache when Redis is not configured. */
export function getRedis() {
  if (client === undefined) {
    client = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        })
      : null;
    client?.on("error", (err) => console.warn(`[redis] ${err.message}`));
  }
  return client;
}

export function getRedisClient() {
  return getRedis() ?? localClient;
}

export function getRedisSubscriber() {
  if (subscriber) return subscriber;

  const redis = getRedis();
  if (!redis) {
    subscriber = {
      subscribe(channel, handler) {
        localBus.on(channel, handler);
      },
      unsubscribe(channel, handler) {
        localBus.off(channel, handler);
      },
    };
    return subscriber;
  }

  const redisSubscriber = redis.duplicate();
  subscriberConnection = redisSubscriber;
  redisSubscriber.on("error", (err) => console.warn(`[redis] subscriber: ${err.message}`));
  const listeners = new Map();
  subscriber = {
    subscribe(channel, handler) {
      const listener = (receivedChannel, message) => {
        if (receivedChannel === channel) {
          Promise.resolve(handler(message)).catch((err) =>
            console.error(`[redis] subscriber handler for ${channel} failed:`, err),
          );
        }
      };
      listeners.set(handler, listener);
      redisSubscriber.on("message", listener);
      return redisSubscriber.subscribe(channel);
    },
    unsubscribe(channel, handler) {
      const listener = listeners.get(handler);
      if (listener) {
        redisSubscriber.off("message", listener);
        listeners.delete(handler);
      }
      return redisSubscriber.unsubscribe(channel);
    },
  };
  return subscriber;
}

/**
 * Publish a JSON message to Redis, or the local event bus when Redis is not configured.
 * Never throws: publish failures must not block indexing.
 */
export async function publish(channel, message, redis = getRedis()) {
  if (!redis) {
    localBus.emit(channel, typeof message === "string" ? message : JSON.stringify(message));
    return true;
  }
  try {
    await redis.publish(channel, JSON.stringify(message));
    return true;
  } catch (err) {
    console.warn(`[redis] publish to ${channel} failed: ${err.message}`);
    return false;
  }
}

export function resetRedis() {
  for (const timer of localTimers.values()) clearTimeout(timer);
  localTimers.clear();
  localValues.clear();
  localBus.removeAllListeners();
  if (client && client !== null) client.disconnect();
  subscriberConnection?.disconnect();
  client = undefined;
  subscriber = undefined;
  subscriberConnection = undefined;
}
