import express from 'express';
import YouTubeHelper from '../utils/youtubeHelper.js';
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
        () => YouTubeHelper.getLiveInfo(null, videoId),
        300
      );

      if (!metadata) {
        logger.warn({ message: 'Video metadata not found', videoId });
        return res.status(404).json({
          success: false,
          error: 'Video not found or unavailable',
          videoId,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Video metadata retrieved',
        videoId,
        method: metadata.method,
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
        () => YouTubeHelper.getLiveInfo(channelId),
        180
      );

      if (!metadata) {
        logger.info({ message: 'Channel not live', channelId });
        return res.json({
          success: true,
          data: {
            channelId,
            isLiveNow: false,
            note: 'Channel is not currently live'
          },
          cached: cacheService.get(cacheKey) !== null,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Channel metadata retrieved',
        channelId,
        method: metadata.method,
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

// New endpoint: Check if channel is live (quick boolean check)
router.get('/status/:channelId', 
  strictRateLimiter,
  validateChannelId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { channelId } = req.params;
      const cacheKey = cacheService.generateKey('status', channelId);

      const isLive = await cacheService.getOrSet(
        cacheKey,
        () => YouTubeHelper.isChannelLive(channelId),
        60 // Cache for 1 minute for status checks
      );

      logger.info({
        message: 'Channel live status checked',
        channelId,
        isLive
      });

      res.json({
        success: true,
        channelId,
        isLive,
        cached: cacheService.get(cacheKey) !== null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// New endpoint: Get viewer count only
router.get('/viewers/:channelId', 
  strictRateLimiter,
  validateChannelId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { channelId } = req.params;
      const cacheKey = cacheService.generateKey('viewers', channelId);

      const viewers = await cacheService.getOrSet(
        cacheKey,
        () => YouTubeHelper.getViewerCount(channelId),
        30 // Cache for 30 seconds for viewer counts
      );

      logger.info({
        message: 'Channel viewer count retrieved',
        channelId,
        viewers
      });

      res.json({
        success: true,
        channelId,
        viewers,
        cached: cacheService.get(cacheKey) !== null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/health', async (req, res) => {
  const stats = cacheService.getStats();
  
  // Check YouTube service status
  let youtubeStatus = null;
  try {
    youtubeStatus = await YouTubeHelper.checkStatus();
  } catch (error) {
    logger.warn({ message: 'Failed to check YouTube service status', error: error.message });
    youtubeStatus = { error: 'Unable to check status' };
  }
  
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
    youtube: {
      methods: youtubeStatus
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// New endpoint: Clear cache
router.post('/cache/clear', (req, res) => {
  cacheService.flush();
  YouTubeHelper.clearCache();
  
  logger.info({ message: 'All caches cleared via API' });
  
  res.json({
    success: true,
    message: 'All caches cleared successfully',
    timestamp: new Date().toISOString()
  });
});

export default router;