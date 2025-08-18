import express from 'express';
import HybridYouTubeService from '../services/hybridYoutubeService.js';
import { validateVideoId, validateChannelId, handleValidationErrors } from '../middleware/validation.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import cacheService from '../services/cacheService.js';
import logger from '../config/logger.js';

const router = express.Router();
const hybridService = new HybridYouTubeService();

// Hybrid endpoint: Free metadata + Accurate viewers (uses YouTube API quota)
router.get('/video/:videoId', 
  strictRateLimiter,
  validateVideoId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { videoId } = req.params;
      const { nocache } = req.query;
      
      let metadata;
      
      if (nocache) {
        // Skip cache for real-time data
        metadata = await hybridService.getLiveMetadata(null, videoId);
      } else {
        // Use separate cache key for hybrid data to avoid mixing with free data
        const cacheKey = cacheService.generateKey('hybrid-api', videoId);
        metadata = await cacheService.getOrSet(
          cacheKey,
          () => hybridService.getLiveMetadata(null, videoId),
          120 // 2 minutes cache for hybrid data (shorter to ensure freshness)
        );
      }

      if (!metadata) {
        logger.warn({ message: 'Video metadata not found (hybrid)', videoId });
        return res.status(404).json({
          success: false,
          error: 'Video not found or unavailable',
          videoId,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Hybrid video metadata retrieved',
        videoId,
        method: metadata.method,
        viewerSource: metadata.viewerCountSource,
        isLive: metadata.isLiveNow,
        viewers: metadata.concurrentViewers,
        quotaUsed: metadata.quotaUsed || 0
      });

      res.json({
        success: true,
        data: metadata,
        cached: !nocache && cacheService.get(cacheService.generateKey('hybrid-api', videoId)) !== null,
        quotaUsage: hybridService.getQuotaUsage(),
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
      const { nocache } = req.query;
      
      let metadata;
      
      if (nocache) {
        metadata = await hybridService.getLiveMetadata(channelId);
      } else {
        const cacheKey = cacheService.generateKey('hybrid-channel', channelId);
        metadata = await cacheService.getOrSet(
          cacheKey,
          () => hybridService.getLiveMetadata(channelId),
          180
        );
      }

      if (!metadata) {
        logger.info({ message: 'Channel not live (hybrid)', channelId });
        return res.json({
          success: true,
          data: {
            channelId,
            isLiveNow: false,
            note: 'Channel is not currently live'
          },
          cached: !nocache,
          quotaUsage: hybridService.getQuotaUsage(),
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Hybrid channel metadata retrieved',
        channelId,
        method: metadata.method,
        viewerSource: metadata.viewerCountSource,
        isLive: metadata.isLiveNow,
        viewers: metadata.concurrentViewers,
        quotaUsed: metadata.quotaUsed || 0
      });

      res.json({
        success: true,
        data: metadata,
        cached: !nocache && cacheService.get(cacheService.generateKey('hybrid-channel', channelId)) !== null,
        quotaUsage: hybridService.getQuotaUsage(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// Quota usage endpoint
router.get('/quota', (req, res) => {
  const usage = hybridService.getQuotaUsage();
  
  res.json({
    success: true,
    quota: usage,
    recommendations: {
      current: usage.quotaUsedToday < 5000 ? 'Low usage - safe' : 
               usage.quotaUsedToday < 8000 ? 'Medium usage - monitor' : 'High usage - consider caching',
      caching: 'Use longer cache times to reduce quota usage',
      batching: 'Use batch endpoints for multiple videos'
    },
    timestamp: new Date().toISOString()
  });
});

// Cost calculator endpoint
router.get('/cost-calculator/:requestsPerDay', (req, res) => {
  const requestsPerDay = parseInt(req.params.requestsPerDay);
  
  if (isNaN(requestsPerDay) || requestsPerDay < 0) {
    return res.status(400).json({
      error: 'Invalid requestsPerDay parameter'
    });
  }
  
  const costs = HybridYouTubeService.calculateCosts(requestsPerDay);
  
  res.json({
    success: true,
    costs,
    recommendations: {
      freeLimit: '10,000 requests/day = $0',
      lightUsage: '1,000-5,000 requests/day = Free',
      heavyUsage: '15,000 requests/day = $0.015/day ($0.45/month)',
      enterprise: '50,000 requests/day = $0.12/day ($3.60/month)'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;