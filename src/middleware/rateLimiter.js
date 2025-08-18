import rateLimit from 'express-rate-limit';
import { config } from '../config/environment.js';

export const createRateLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || config.RATE_LIMIT_WINDOW,
    max: options.max || config.RATE_LIMIT_MAX,
    message: {
      error: {
        message: 'Too many requests from this IP, please try again later.',
        status: 429,
        timestamp: new Date().toISOString()
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...options
  });
};

export const apiRateLimiter = createRateLimiter();

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100
});