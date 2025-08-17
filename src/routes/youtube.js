import express from 'express';
import { YouTubeMetadataService } from '../utils/youtubeMetadata.js';
import { validateVideoId, validateChannelId, handleValidationErrors } from '../middleware/validation.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import cacheService from '../services/cacheService.js';
import logger from '../config/logger.js';

const router = express.Router();

router.get('/video/:videoId', 
  strictRateLimiter,
  validateVideoId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { videoId } = req.params;
      const cacheKey = cacheService.generateKey('video', videoId);

      const metadata = await cacheService.getOrSet(
        cacheKey,
        () => YouTubeMetadataService.getVideoMetadata(videoId),
        300
      );

      logger.info({
        message: 'Video metadata retrieved',
        videoId,
        isLive: metadata.isLiveNow,
        title: metadata.title
      });

      res.json({
        success: true,
        data: metadata,
        cached: cacheService.get(cacheKey) !== null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/channel/:channelId',
  strictRateLimiter,
  validateChannelId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { channelId } = req.params;
      const cacheKey = cacheService.generateKey('channel', channelId);

      const metadata = await cacheService.getOrSet(
        cacheKey,
        () => YouTubeMetadataService.getChannelMetadata(channelId),
        180
      );

      logger.info({
        message: 'Channel metadata retrieved',
        channelId,
        isLive: metadata.isLiveNow,
        videoId: metadata.videoId
      });

      res.json({
        success: true,
        data: metadata,
        cached: cacheService.get(cacheKey) !== null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/health', (req, res) => {
  const stats = cacheService.getStats();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    cache: {
      keys: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits > 0 ? (stats.hits / (stats.hits + stats.misses)).toFixed(2) : '0.00'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

export default router;