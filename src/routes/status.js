import express from 'express';
import { validateVideoId, validateChannelId, handleValidationErrors } from '../middleware/validation.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import cacheService from '../services/cacheService.js';
import logger from '../config/logger.js';
import youtubeService from '../services/youtubeService.js';

const router = express.Router();

/**
 * Live Status Check Endpoints
 * Check if channels/videos are currently live using Innertube
 */

// Check if a specific video is live
router.get('/video/:videoId',
  strictRateLimiter,
  validateVideoId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { videoId } = req.params;
      const { nocache } = req.query;

      let result;

      if (nocache) {
        // Get fresh status
        result = await getVideoLiveStatus(videoId);
      } else {
        // Use cache (30 seconds for live status)
        const cacheKey = cacheService.generateKey('live-status-video', videoId);
        result = await cacheService.getOrSet(
          cacheKey,
          () => getVideoLiveStatus(videoId),
          30 // 30 seconds cache for live status
        );
      }

      logger.info({
        message: 'Video live status checked',
        videoId,
        isLive: result.isLive,
        method: result.method
      });

      res.json({
        success: true,
        videoId,
        isLive: result.isLive,
        method: result.method,
        title: result.title || null,
        channelName: result.channelName || null,
        note: result.isLive ?
          'Video is live' :
          'Video is not live',
        cached: !nocache && cacheService.get(cacheService.generateKey('live-status-video', videoId)) !== null,
        quotaUsed: 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// Check if a channel is live
router.get('/channel/:channelId',
  strictRateLimiter,
  validateChannelId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { channelId } = req.params;
      const { nocache } = req.query;

      let result;

      if (nocache) {
        // Get fresh status using youtubeService directly
        result = await getChannelLiveStatusDirect(channelId);
      } else {
        // Use shorter cache (20 seconds for channel status since it's now fast)
        const cacheKey = cacheService.generateKey('live-status-channel', channelId);
        result = await cacheService.getOrSet(
          cacheKey,
          () => getChannelLiveStatusDirect(channelId),
          20 // 20 seconds cache for channel status (reduced from 60s)
        );
      }

      logger.info({
        message: 'Channel live status checked',
        channelId,
        isLive: result.isLive,
        liveVideoId: result.liveVideoId,
        method: result.method
      });

      res.json({
        success: true,
        channelId,
        isLive: result.isLive,
        liveVideoId: result.liveVideoId || null,
        method: result.method,
        title: result.title || null,
        channelName: result.channelName || null,
        note: result.isLive ?
          `Channel is live - use /api/youtube/video/${result.liveVideoId} for details` :
          'Channel is not currently live',
        cached: !nocache && cacheService.get(cacheService.generateKey('live-status-channel', channelId)) !== null,
        quotaUsed: 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// Batch status check for multiple videos
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
          const result = await getVideoLiveStatus(videoId);
          results[videoId] = {
            isLive: result.isLive,
            title: result.title,
            method: result.method
          };
        } catch (error) {
          results[videoId] = {
            isLive: false,
            error: error.message,
            method: 'error'
          };
        }
      });

      await Promise.all(promises);

      logger.info({
        message: 'Batch video status check completed',
        videoCount: videoIds.length,
        liveCount: Object.values(results).filter(r => r.isLive).length
      });

      res.json({
        success: true,
        results,
        summary: {
          total: videoIds.length,
          live: Object.values(results).filter(r => r.isLive).length,
          notLive: Object.values(results).filter(r => !r.isLive && !r.error).length,
          errors: Object.values(results).filter(r => r.error).length
        },
        quotaUsed: 0,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// Helper function to get video live status
async function getVideoLiveStatus(videoId) {
  try {
    const metadata = await youtubeService.getLiveMetadata(null, videoId);

    if (metadata) {
      return {
        isLive: metadata.isLiveNow || false,
        title: metadata.title,
        channelName: metadata.channelName,
        method: metadata.method
      };
    }

    return {
      isLive: false,
      title: null,
      channelName: null,
      method: 'not_found'
    };
  } catch (error) {
    return {
      isLive: false,
      title: null,
      channelName: null,
      method: 'error',
      error: error.message
    };
  }
}

// Helper function to get channel live status
async function getChannelLiveStatusDirect(channelId) {
  try {
    const metadata = await youtubeService.getLiveMetadata(channelId);

    if (metadata && metadata.isLiveNow) {
      return {
        isLive: true,
        liveVideoId: metadata.videoId || null,
        title: metadata.title || null,
        channelName: metadata.channelName || null,
        method: metadata.method,
        error: undefined
      };
    }

    return {
      isLive: false,
      liveVideoId: null,
      title: null,
      channelName: null,
      method: 'not-live',
      error: null
    };
  } catch (error) {
    return {
      isLive: false,
      liveVideoId: null,
      title: null,
      channelName: null,
      method: 'error',
      error: error.message
    };
  }
}

export default router;