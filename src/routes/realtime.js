import express from 'express';
import RealtimeYouTubeHelper from '../utils/realtimeYoutubeHelper.js';
import { validateVideoId, validateChannelId, handleValidationErrors } from '../middleware/validation.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import logger from '../config/logger.js';

const router = express.Router();

// Real-time endpoints with minimal caching for more accurate data
router.get('/video/:videoId', 
  strictRateLimiter,
  validateVideoId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { videoId } = req.params;
      
      // No caching for real-time data - force direct scraping
      const metadata = await RealtimeYouTubeHelper.getFreshLiveInfo(null, videoId);

      if (!metadata) {
        logger.warn({ message: 'Video metadata not found (realtime)', videoId });
        return res.status(404).json({
          success: false,
          error: 'Video not found or unavailable',
          videoId,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Real-time video metadata retrieved',
        videoId,
        method: metadata.method,
        isLive: metadata.isLiveNow,
        viewers: metadata.concurrentViewers
      });

      res.json({
        success: true,
        data: metadata,
        realtime: true,
        cached: false,
        note: 'Real-time data - viewer counts may differ from YouTube web interface due to different data sources',
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
      
      // No caching for real-time data - force direct scraping
      const metadata = await RealtimeYouTubeHelper.getFreshLiveInfo(channelId);

      if (!metadata) {
        logger.info({ message: 'Channel not live (realtime)', channelId });
        return res.json({
          success: true,
          data: {
            channelId,
            isLiveNow: false,
            note: 'Channel is not currently live'
          },
          realtime: true,
          cached: false,
          timestamp: new Date().toISOString()
        });
      }

      logger.info({
        message: 'Real-time channel metadata retrieved',
        channelId,
        method: metadata.method,
        isLive: metadata.isLiveNow,
        viewers: metadata.concurrentViewers
      });

      res.json({
        success: true,
        data: metadata,
        realtime: true,
        cached: false,
        note: 'Real-time data - viewer counts may differ from YouTube web interface due to different data sources',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

// Debug endpoint - compare all methods
router.get('/debug/:videoId', 
  strictRateLimiter,
  validateVideoId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { videoId } = req.params;
      const results = {};
      
      // Method 1: Cached service
      try {
        const { default: YouTubeHelper } = await import('../utils/youtubeHelper.js');
        results.cached = await YouTubeHelper.getLiveInfo(null, videoId);
      } catch (error) {
        results.cached = { error: error.message };
      }
      
      // Method 2: Direct scraping
      try {
        results.directScraping = await RealtimeYouTubeHelper.getFreshLiveInfo(null, videoId);
      } catch (error) {
        results.directScraping = { error: error.message };
      }
      
      logger.info({
        message: 'Debug comparison completed',
        videoId,
        cachedViewers: results.cached?.concurrentViewers,
        scrapingViewers: results.directScraping?.concurrentViewers
      });

      res.json({
        success: true,
        videoId,
        methods: results,
        comparison: {
          cachedViewers: results.cached?.concurrentViewers || 'N/A',
          scrapingViewers: results.directScraping?.concurrentViewers || 'N/A',
          difference: results.cached?.concurrentViewers && results.directScraping?.concurrentViewers 
            ? Math.abs(results.cached.concurrentViewers - results.directScraping.concurrentViewers)
            : 'N/A'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;