import express from 'express';
import youtubeService from '../services/youtubeService.js';
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
        () => youtubeService.getLiveMetadata(null, videoId),
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
        () => youtubeService.getLiveMetadata(channelId),
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

      const metadata = await cacheService.getOrSet(
        cacheKey,
        () => youtubeService.getLiveMetadata(channelId),
        60 // Cache for 1 minute for status checks
      );

      const isLive = metadata?.isLiveNow === true;

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

      const metadata = await cacheService.getOrSet(
        cacheKey,
        () => youtubeService.getLiveMetadata(channelId),
        30 // Cache for 30 seconds for viewer counts
      );

      const viewers = metadata?.concurrentViewers || null;

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
    youtubeStatus = await youtubeService.checkAvailableMethods();
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

// New endpoint: Get live chat data
router.get('/livechat/:videoId',
  strictRateLimiter,
  validateVideoId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { videoId } = req.params;

      const chatData = await youtubeService.getLiveChatData(videoId);

      if (!chatData) {
        return res.status(404).json({
          success: false,
          error: 'Live chat not available for this video',
          videoId,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Live chat data retrieved',
        videoId,
        messageCount: chatData.messageCount
      });

      res.json({
        success: true,
        videoId,
        chatData,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// New endpoint: Get live stats
router.get('/livestats/:videoId',
  strictRateLimiter,
  validateVideoId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { videoId } = req.params;

      const stats = await youtubeService.getLiveStats(videoId);

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Live stats not available for this video',
          videoId,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Live stats retrieved',
        videoId,
        viewers: stats.concurrentViewers
      });

      res.json({
        success: true,
        videoId,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// New endpoint: Get channel by handle
router.get('/handle/:handle',
  strictRateLimiter,
  async (req, res, next) => {
    try {
      const { handle } = req.params;
      const cacheKey = cacheService.generateKey('handle', handle);

      const metadata = await cacheService.getOrSet(
        cacheKey,
        () => youtubeService.getLiveMetadata(null, null, handle),
        180
      );

      if (!metadata) {
        logger.info({ message: 'Channel not live', handle });
        return res.json({
          success: true,
          data: {
            handle,
            isLiveNow: false,
            note: 'Channel is not currently live'
          },
          cached: cacheService.get(cacheKey) !== null,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Channel metadata retrieved by handle',
        handle,
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

// New endpoint: Clear cache
router.post('/cache/clear', (req, res) => {
  cacheService.flush();
  youtubeService.clearCache();

  logger.info({ message: 'All caches cleared via API' });

  res.json({
    success: true,
    message: 'All caches cleared successfully',
    timestamp: new Date().toISOString()
  });
});

export default router;