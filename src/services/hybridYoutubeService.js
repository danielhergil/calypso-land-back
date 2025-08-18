import YouTubeApiHelper from '../utils/youtubeApiHelper.js';
import innertubeHelper from '../utils/innertubeHelper.js';
import youtubeService from './youtubeService.js';

/**
 * Hybrid YouTube Service
 * - Uses YouTube Data API v3 ONLY for accurate concurrent viewers (costs quota)
 * - Uses free methods (innerTube.js, yt-dlp, scraping) for all other metadata
 * 
 * Best of both worlds: Accurate viewers + Free metadata
 */
class HybridYouTubeService {
  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY || null;
    this.youtubeApi = this.apiKey ? new YouTubeApiHelper(this.apiKey) : null;
    this.quotaUsed = 0;
    this.quotaStartTime = Date.now();
    
    if (this.apiKey) {
      console.log('✅ YouTube Data API v3 configured - will use for concurrent viewers');
    } else {
      console.log('⚠️ No YouTube API key found - using free methods only');
    }
  }

  async getLiveMetadata(channelId, videoId = null) {
    try {
      // Step 1: Get metadata from free sources (no quota cost)
      console.log('📦 Getting metadata from free sources...');
      const freeMetadata = await youtubeService.getLiveMetadata(channelId, videoId);
      
      if (!freeMetadata) {
        return null;
      }

      // Step 2: If we have YouTube API, get accurate viewer count (costs 1 quota)
      if (this.youtubeApi && freeMetadata.videoId) {
        try {
          console.log('🔑 Getting accurate viewer count from YouTube API...');
          const apiViewerData = await this.youtubeApi.getConcurrentViewers(freeMetadata.videoId);
          
          if (apiViewerData) {
            // Replace viewer count with accurate API data
            this.quotaUsed += apiViewerData.apiQuotaUsed;
            
            return {
              ...freeMetadata,
              concurrentViewers: apiViewerData.concurrentViewers,
              viewerCountType: 'concurrent_viewers_api', // Official concurrent viewers
              viewerCountSource: 'youtube_data_api_v3',
              actualStartTime: apiViewerData.actualStartTime || freeMetadata.actualStartTime,
              isLiveNow: apiViewerData.isLiveNow,
              quotaUsed: apiViewerData.apiQuotaUsed,
              hybrid: true
            };
          }
        } catch (apiError) {
          console.warn('YouTube API failed, using free viewer count:', apiError.message);
          // Fall back to free viewer count with warning
          return {
            ...freeMetadata,
            viewerCountType: 'total_stream_views', // Fallback to free data
            viewerCountSource: freeMetadata.method,
            apiError: apiError.message,
            hybrid: true
          };
        }
      }

      // Step 3: No API key or API failed, use free data only
      return {
        ...freeMetadata,
        viewerCountType: 'total_stream_views',
        viewerCountSource: freeMetadata.method,
        hybrid: false,
        note: this.apiKey ? 'API failed, using free data' : 'No API key configured'
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Get viewer count for multiple videos efficiently (batch API call)
   */
  async getMultipleViewerCounts(videoIds) {
    if (!this.youtubeApi) {
      throw new Error('YouTube API key required for batch operations');
    }

    try {
      const viewerData = await this.youtubeApi.getConcurrentViewersBatch(videoIds);
      this.quotaUsed += 1; // Batch request costs 1 quota regardless of size
      
      return viewerData;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get quota usage statistics
   */
  getQuotaUsage() {
    const timeSinceReset = Date.now() - this.quotaStartTime;
    const hoursElapsed = timeSinceReset / (1000 * 60 * 60);
    
    return {
      quotaUsedToday: this.quotaUsed,
      freeQuotaLimit: 10000,
      quotaRemaining: Math.max(0, 10000 - this.quotaUsed),
      willExceedFree: this.quotaUsed > 10000,
      estimatedDailyCost: this.quotaUsed > 10000 ? ((this.quotaUsed - 10000) / 1000) * 0.003 : 0,
      hoursElapsed: Math.round(hoursElapsed * 100) / 100,
      averageQuotaPerHour: hoursElapsed > 0 ? Math.round((this.quotaUsed / hoursElapsed) * 100) / 100 : 0
    };
  }

  /**
   * Calculate cost estimates for different usage patterns
   */
  static calculateCosts(requestsPerDay) {
    const freeLimit = 10000;
    const costPer1000 = 0.003;
    
    const scenarios = {
      light: { requests: 1000, cost: 0, description: 'Light usage - well within free tier' },
      medium: { requests: 5000, cost: 0, description: 'Medium usage - still free' },
      heavy: { requests: 15000, cost: 0.015, description: 'Heavy usage - $0.015/day' },
      enterprise: { requests: 50000, cost: 0.12, description: 'Enterprise usage - $0.12/day' }
    };

    const customCost = requestsPerDay > freeLimit ? 
      Math.ceil((requestsPerDay - freeLimit) / 1000) * costPer1000 : 0;

    return {
      daily: {
        requests: requestsPerDay,
        cost: customCost,
        monthly: customCost * 30,
        yearly: customCost * 365
      },
      scenarios,
      comparison: {
        freeMethod: { accuracy: 'Low (total views)', cost: 0, reliability: 'Medium' },
        hybridMethod: { accuracy: 'High (concurrent viewers)', cost: customCost, reliability: 'High' }
      }
    };
  }
}

export default HybridYouTubeService;