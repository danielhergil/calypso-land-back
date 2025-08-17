import NodeCache from 'node-cache';
import { config } from '../config/environment.js';
import logger from '../config/logger.js';

class CacheService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: config.CACHE_TTL,
      checkperiod: Math.floor(config.CACHE_TTL / 2),
      useClones: false
    });

    this.cache.on('set', (key, value) => {
      logger.debug({ message: 'Cache set', key, size: JSON.stringify(value).length });
    });

    this.cache.on('expired', (key, value) => {
      logger.debug({ message: 'Cache expired', key });
    });

    this.cache.on('del', (key, value) => {
      logger.debug({ message: 'Cache deleted', key });
    });
  }

  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      logger.debug({ message: 'Cache hit', key });
      return value;
    }
    logger.debug({ message: 'Cache miss', key });
    return null;
  }

  set(key, value, ttl = null) {
    const success = ttl ? this.cache.set(key, value, ttl) : this.cache.set(key, value);
    logger.debug({ 
      message: 'Cache set attempt', 
      key, 
      success, 
      ttl: ttl || config.CACHE_TTL 
    });
    return success;
  }

  del(key) {
    const count = this.cache.del(key);
    logger.debug({ message: 'Cache delete', key, deletedCount: count });
    return count > 0;
  }

  flush() {
    this.cache.flushAll();
    logger.info({ message: 'Cache flushed' });
  }

  getStats() {
    return this.cache.getStats();
  }

  generateKey(type, identifier) {
    return `youtube:${type}:${identifier}`;
  }

  async getOrSet(key, fetchFunction, ttl = null) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    try {
      const value = await fetchFunction();
      this.set(key, value, ttl);
      return value;
    } catch (error) {
      logger.error({ 
        message: 'Failed to fetch and cache data', 
        key, 
        error: error.message 
      });
      throw error;
    }
  }
}

export default new CacheService();