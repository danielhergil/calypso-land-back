import innertubeHelper from '../utils/innertubeHelper.js';
import webScrapingHelper from '../utils/webScrapingHelper.js';
import ytdlHelper from '../utils/ytdlHelper.js';

class YouTubeService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getLiveMetadata(channelId, videoId = null, channelHandle = null) {
    const cacheKey = videoId || channelId || channelHandle;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    // Set overall timeout for the entire operation (max 12 seconds for Cloud Run)
    const globalTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Service timeout - channel likely offline')), 12000)
    );

    const checkMethods = async () => {
      let result = null;

      // Method 1: Try YTDL-Core first (fastest and most reliable for status checks)
      if (channelId && !videoId && !channelHandle) {
        try {
          console.log('Trying YTDL-Core method...');
          result = await Promise.race([
            ytdlHelper.getQuickLiveInfo(channelId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('YTDL timeout')), 3000))
          ]);
          if (result && result.isLiveNow) {
            console.log('YTDL-Core detected live stream');
            this.setCacheAndReturn(cacheKey, result);
            return result;
          }
        } catch (error) {
          console.warn('YTDL-Core method failed:', error.message);
        }
      }

      // Method 2: Try Innertube (for full metadata and handles)
      try {
        console.log('Trying Innertube method...');
        result = await Promise.race([
          innertubeHelper.getLiveInfo(channelId, videoId, channelHandle),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Innertube timeout')), 8000))
        ]);
        if (result && result.isLiveNow) {
          console.log('Innertube detected live stream');
          this.setCacheAndReturn(cacheKey, result);
          return result;
        }
      } catch (error) {
        console.warn('InnerTube method failed:', error.message);
      }

      // Method 3: Try web scraping as final fallback
      try {
        console.log('Trying web scraping method...');
        result = await Promise.race([
          webScrapingHelper.getLiveInfo(channelId, videoId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Web scraping timeout')), 2000))
        ]);
        if (result) {
          console.log(`Web scraping result: live=${result.isLiveNow}`);
          this.setCacheAndReturn(cacheKey, result);
          return result;
        }
      } catch (error) {
        console.warn('Web scraping method failed:', error.message);
      }

      console.log('No live stream detected by any method');
      return null;
    };

    try {
      return await Promise.race([
        checkMethods(),
        globalTimeout
      ]);
    } catch (error) {
      console.log('Service operation timed out:', error.message);
      return null;
    }
  }

  async getLiveChatData(videoId) {
    try {
      return await innertubeHelper.getLiveChatData(videoId);
    } catch (error) {
      console.warn('Failed to get live chat data:', error.message);
      return null;
    }
  }

  async getLiveStats(videoId) {
    try {
      return await innertubeHelper.getLiveStats(videoId);
    } catch (error) {
      console.warn('Failed to get live stats:', error.message);
      return null;
    }
  }

  setCacheAndReturn(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    return data;
  }

  async checkAvailableMethods() {
    const methods = {
      innertube: false,
      webscraping: false
    };

    try {
      await innertubeHelper.init();
      methods.innertube = true;
    } catch (error) {
      // innerTube not available
    }

    // Web scraping is always available if fetch is working
    try {
      const testResponse = await fetch('https://www.youtube.com', { method: 'HEAD', timeout: 5000 });
      methods.webscraping = testResponse.ok;
    } catch (error) {
      methods.webscraping = false;
    }

    return methods;
  }

  async getQuickLiveStatus(channelId) {
    try {
      // Ultra-fast status check using only YTDL-Core
      console.log(`Quick status check for channel: ${channelId}`);

      const isLive = await Promise.race([
        ytdlHelper.isChannelLive(channelId),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Quick status timeout')), 2000)
        )
      ]);

      return {
        success: true,
        channelId,
        isLive: !!isLive,
        method: 'ytdl-quick',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Quick status check failed:', error.message);
      return {
        success: false,
        channelId,
        isLive: false,
        method: 'ytdl-quick-timeout',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

export default new YouTubeService();