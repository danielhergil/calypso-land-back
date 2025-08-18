import youtubeService from '../services/youtubeService.js';

/**
 * Simple wrapper for your existing routes
 * Drop-in replacement that handles all the fallback logic internally
 */
class YouTubeHelper {
  
  /**
   * Get live stream metadata for a channel or video
   * @param {string} channelId - YouTube channel ID (starts with UC) 
   * @param {string} videoId - YouTube video ID (optional)
   * @returns {Promise<Object|null>} Live stream metadata or null if not live
   */
  static async getLiveInfo(channelId, videoId = null) {
    try {
      return await youtubeService.getLiveMetadata(channelId, videoId);
    } catch (error) {
      console.error('YouTube Helper Error:', error.message);
      return null;
    }
  }

  /**
   * Check if a channel is currently live
   * @param {string} channelId - YouTube channel ID
   * @returns {Promise<boolean>} True if channel is live
   */
  static async isChannelLive(channelId) {
    try {
      const info = await youtubeService.getLiveMetadata(channelId);
      return info?.isLiveNow === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current viewer count for a live stream
   * @param {string} channelId - YouTube channel ID
   * @param {string} videoId - YouTube video ID (optional)
   * @returns {Promise<number|null>} Current viewer count or null
   */
  static async getViewerCount(channelId, videoId = null) {
    try {
      const info = await youtubeService.getLiveMetadata(channelId, videoId);
      return info?.concurrentViewers || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get available methods status
   * @returns {Promise<Object>} Object showing which methods are working
   */
  static async checkStatus() {
    return await youtubeService.checkAvailableMethods();
  }

  /**
   * Fast channel status check - uses only innerTube.js with timeout
   * @param {string} channelId - YouTube channel ID
   * @returns {Promise<Object>} Fast status result
   */
  static async getChannelLiveStatusFast(channelId) {
    try {
      // Only use innerTube.js for fast status check with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Fast check timeout')), 3000);
      });
      
      const innertubeHelper = await import('../utils/innertubeHelper.js');
      const metadataPromise = innertubeHelper.default.getLiveInfo(channelId);
      
      const metadata = await Promise.race([metadataPromise, timeoutPromise]);
      
      if (metadata && metadata.isLiveNow) {
        return {
          isLive: true,
          liveVideoId: metadata.videoId,
          title: metadata.title,
          channelName: metadata.channelName,
          method: 'innertube-fast'
        };
      }
      
      return {
        isLive: false,
        method: 'innertube-fast',
        error: null
      };
    } catch (error) {
      return {
        isLive: false,
        method: 'timeout-or-error',
        error: error.message
      };
    }
  }

  /**
   * Clear the cache
   */
  static clearCache() {
    youtubeService.clearCache();
  }
}

export default YouTubeHelper;