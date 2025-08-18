import { getLiveMetaFromVideoId, resolveLiveVideoIdStrict } from '../scripts/live_meta_from_channel.mjs';

/**
 * Real-time YouTube Helper - Forces direct scraping, bypasses yt-dlp and caches
 * This should give the most up-to-date data available, but may be slower and more prone to rate limiting
 */
class RealtimeYouTubeHelper {
  
  /**
   * Get live stream metadata directly from YouTube with minimal caching
   * Forces enhanced scraping method only
   */
  static async getFreshLiveInfo(channelId, videoId = null) {
    try {
      console.log('🔍 Forcing direct scraping method for real-time data...');
      
      if (videoId) {
        // Direct video scraping
        const metadata = await getLiveMetaFromVideoId(videoId);
        return {
          ...metadata,
          method: 'direct-scraping',
          freshness: 'real-time',
          note: 'Direct scraping from YouTube - most current data available'
        };
      }
      
      if (channelId) {
        // Resolve channel to video ID first, then scrape
        const resolvedVideoId = await resolveLiveVideoIdStrict(channelId);
        if (!resolvedVideoId) {
          return null;
        }
        
        const metadata = await getLiveMetaFromVideoId(resolvedVideoId);
        return {
          ...metadata,
          method: 'direct-scraping',
          freshness: 'real-time',
          channelId: channelId,
          note: 'Direct scraping from YouTube - most current data available'
        };
      }
      
      return null;
      
    } catch (error) {
      if (error.message.includes('429')) {
        throw new Error('Rate limited - YouTube is blocking requests. Try again in a few minutes or use cached endpoints.');
      }
      throw error;
    }
  }

  /**
   * Get viewer count only with direct scraping
   */
  static async getFreshViewerCount(channelId, videoId = null) {
    try {
      const info = await this.getFreshLiveInfo(channelId, videoId);
      return info?.concurrentViewers || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if channel is live with direct scraping
   */
  static async isFreshChannelLive(channelId) {
    try {
      const info = await this.getFreshLiveInfo(channelId);
      return info?.isLiveNow === true;
    } catch (error) {
      return false;
    }
  }
}

export default RealtimeYouTubeHelper;