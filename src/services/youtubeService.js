import innertubeHelper from '../utils/innertubeHelper.js';
import webScrapingHelper from '../utils/webScrapingHelper.js';

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

    let result = null;

    // Method 1: Try Innertube first (faster when it works)
    try {
      console.log('Trying Innertube method...');
      result = await innertubeHelper.getLiveInfo(channelId, videoId, channelHandle);
      if (result && result.isLiveNow) {
        console.log('Innertube detected live stream');
        this.setCacheAndReturn(cacheKey, result);
        return result;
      }
    } catch (error) {
      console.warn('InnerTube method failed:', error.message);
    }

    // Method 2: Try web scraping as fallback (more reliable)
    try {
      console.log('Trying web scraping method...');
      result = await webScrapingHelper.getLiveInfo(channelId, videoId);
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

  clearCache() {
    this.cache.clear();
  }
}

export default new YouTubeService();