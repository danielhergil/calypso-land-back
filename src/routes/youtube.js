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

      // Add very aggressive timeout wrapper at route level
      const fastTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Route timeout - returning offline')), 1500)
      );

      let metadata = null;
      let fromCache = false;

      // Check cache first manually
      const cached = cacheService.get(cacheKey);
      if (cached) {
        metadata = cached;
        fromCache = true;
        logger.info({ message: 'Using cached data for status check', channelId });
      } else {
        try {
          // Direct call without cache wrapper for timeout
          metadata = await Promise.race([
            youtubeService.getLiveMetadata(channelId),
            fastTimeout
          ]);

          // Cache the result if we got one
          if (metadata) {
            cacheService.set(cacheKey, metadata, 60);
          }
        } catch (timeoutError) {
          logger.warn({
            message: 'Channel status check timed out, returning offline',
            channelId,
            error: timeoutError.message
          });
          // Return offline status for timeout
          return res.json({
            success: true,
            channelId,
            isLive: false,
            cached: false,
            note: 'Timeout - assuming offline',
            timestamp: new Date().toISOString()
          });
        }
      }

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
        cached: fromCache,
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

// New endpoint: Ultra-fast status check using YTDL-Core only
router.get('/quick-status/:channelId',
  strictRateLimiter,
  validateChannelId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { channelId } = req.params;

      // Use the new quick status method
      const result = await youtubeService.getQuickLiveStatus(channelId);

      logger.info({
        message: 'Quick status check completed',
        channelId,
        isLive: result.isLive,
        method: result.method
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// New endpoint: Batch video metadata retrieval
router.post('/batch/videos',
  strictRateLimiter,
  async (req, res, next) => {
    try {
      const { videoIds } = req.body;

      if (!Array.isArray(videoIds) || videoIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'videoIds must be a non-empty array'
        });
      }

      if (videoIds.length > 20) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 20 videos per batch request'
        });
      }

      const results = {};
      const promises = videoIds.map(async (videoId) => {
        try {
          const cacheKey = cacheService.generateKey('video', videoId);
          const metadata = await cacheService.getOrSet(
            cacheKey,
            () => youtubeService.getLiveMetadata(null, videoId),
            300
          );

          if (metadata) {
            results[videoId] = {
              success: true,
              data: metadata,
              cached: cacheService.get(cacheKey) !== null
            };
          } else {
            results[videoId] = {
              success: false,
              error: 'Video not found or unavailable',
              data: null
            };
          }
        } catch (error) {
          results[videoId] = {
            success: false,
            error: error.message,
            data: null
          };
        }
      });

      await Promise.all(promises);

      logger.info({
        message: 'Batch video metadata retrieval completed',
        videoCount: videoIds.length,
        successCount: Object.values(results).filter(r => r.success).length
      });

      res.json({
        success: true,
        results,
        summary: {
          total: videoIds.length,
          successful: Object.values(results).filter(r => r.success).length,
          failed: Object.values(results).filter(r => !r.success).length
        },
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