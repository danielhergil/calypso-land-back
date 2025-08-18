/**
 * YouTube Data API v3 Helper - Only for getting accurate viewer counts
 * Uses official API for concurrent viewers, combines with other metadata sources
 */
class YouTubeApiHelper {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  /**
   * Get ONLY viewer count from YouTube Data API v3
   * This is the most accurate source for concurrent viewers
   */
  async getConcurrentViewers(videoId) {
    if (!this.apiKey || this.apiKey === 'YOUR_API_KEY') {
      throw new Error('YouTube API key not configured');
    }

    try {
      const url = `${this.baseUrl}/videos?part=liveStreamingDetails&id=${videoId}&key=${this.apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`YouTube API error: ${data.error.message}`);
      }
      
      if (!data.items || data.items.length === 0) {
        return null;
      }
      
      const video = data.items[0];
      const liveDetails = video.liveStreamingDetails;
      
      if (!liveDetails) {
        return null; // Not a live stream
      }
      
      return {
        concurrentViewers: parseInt(liveDetails.concurrentViewers) || null,
        actualStartTime: liveDetails.actualStartTime || null,
        scheduledStartTime: liveDetails.scheduledStartTime || null,
        isLiveNow: !!liveDetails.concurrentViewers,
        apiQuotaUsed: 1 // This call costs 1 quota unit
      };
      
    } catch (error) {
      throw new Error(`YouTube API request failed: ${error.message}`);
    }
  }

  /**
   * Get concurrent viewers for multiple videos (batch request)
   * More efficient for multiple videos
   */
  async getConcurrentViewersBatch(videoIds) {
    if (!this.apiKey || this.apiKey === 'YOUR_API_KEY') {
      throw new Error('YouTube API key not configured');
    }

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return {};
    }

    // YouTube API allows up to 50 IDs per request
    const batchSize = 50;
    const results = {};
    
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      const url = `${this.baseUrl}/videos?part=liveStreamingDetails&id=${batch.join(',')}&key=${this.apiKey}`;
      
      try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
          throw new Error(`YouTube API error: ${data.error.message}`);
        }
        
        if (data.items) {
          data.items.forEach(video => {
            const liveDetails = video.liveStreamingDetails;
            results[video.id] = {
              concurrentViewers: liveDetails ? parseInt(liveDetails.concurrentViewers) || null : null,
              actualStartTime: liveDetails?.actualStartTime || null,
              isLiveNow: !!(liveDetails?.concurrentViewers),
              apiQuotaUsed: 1 / batch.length // Quota cost distributed across batch
            };
          });
        }
      } catch (error) {
        console.error(`Batch request failed for batch starting at ${i}:`, error.message);
      }
    }
    
    return results;
  }

  /**
   * Calculate approximate daily quota usage
   */
  static calculateDailyQuota(requestsPerDay) {
    return {
      quotaPerRequest: 1,
      dailyQuota: requestsPerDay,
      freeLimit: 10000,
      willExceedFree: requestsPerDay > 10000,
      estimatedCost: requestsPerDay > 10000 ? Math.ceil((requestsPerDay - 10000) / 1000) * 0.003 : 0
    };
  }

  /**
   * Get quota usage statistics
   */
  getQuotaStats() {
    return {
      freeQuotaLimit: 10000,
      costPer1000Units: 0.003, // $0.003 USD
      resetFrequency: 'daily',
      batchingBenefit: 'Up to 50 videos per request uses same 1 quota unit'
    };
  }
}

export default YouTubeApiHelper;