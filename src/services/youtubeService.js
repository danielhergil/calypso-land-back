import { execSync } from 'child_process';
import innertubeHelper from '../utils/innertubeHelper.js';

class YouTubeService {
  constructor() {
    this.invidious_instances = [
      'https://invidious.io',
      'https://invidious.kavin.rocks',
      'https://inv.riverside.rocks',
      'https://invidious.snopyta.org'
    ];
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getLiveMetadata(channelId, videoId = null) {
    const cacheKey = videoId || channelId;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    let result = null;
    let lastError = null;

    // Method 1: Try innerTube.js first (most accurate)
    try {
      result = await this.tryInnerTube(channelId, videoId);
      if (result) {
        this.setCacheAndReturn(cacheKey, result);
        return result;
      }
    } catch (error) {
      lastError = error;
      console.warn('innerTube method failed:', error.message);
    }

    // Method 2: Try yt-dlp if available
    try {
      result = await this.tryYtDlp(channelId, videoId);
      if (result) {
        this.setCacheAndReturn(cacheKey, result);
        return result;
      }
    } catch (error) {
      lastError = error;
      console.warn('yt-dlp method failed:', error.message);
    }

    // Method 3: Try Invidious instances
    try {
      result = await this.tryInvidious(channelId, videoId);
      if (result) {
        this.setCacheAndReturn(cacheKey, result);
        return result;
      }
    } catch (error) {
      lastError = error;
      console.warn('Invidious method failed:', error.message);
    }

    // Method 4: Fallback to enhanced scraping
    try {
      result = await this.tryEnhancedScraping(channelId, videoId);
      if (result) {
        this.setCacheAndReturn(cacheKey, result);
        return result;
      }
    } catch (error) {
      lastError = error;
      console.warn('Enhanced scraping failed:', error.message);
    }

    throw new Error(`All methods failed. Last error: ${lastError?.message}`);
  }

  setCacheAndReturn(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    return data;
  }

  async tryInnerTube(channelId, videoId) {
    try {
      return await innertubeHelper.getLiveInfo(channelId, videoId);
    } catch (error) {
      throw error;
    }
  }

  async tryYtDlp(channelId, videoId) {
    const url = videoId 
      ? `https://www.youtube.com/watch?v=${videoId}`
      : `https://www.youtube.com/channel/${channelId}/live`;

    try {
      const command = `yt-dlp --dump-json --playlist-end 1 "${url}"`;
      const output = execSync(command, { 
        encoding: 'utf8', 
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
      });
      
      const data = JSON.parse(output);
      
      return {
        method: 'yt-dlp',
        videoId: data.id,
        title: data.title,
        channelName: data.uploader,
        isLiveNow: data.is_live === true,
        concurrentViewers: data.view_count || null,
        thumbnails: data.thumbnail ? [{ url: data.thumbnail }] : [],
        description: data.description ? data.description.substring(0, 300) : null,
        actualStartTime: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : null,
        isLiveContent: data.is_live === true
      };
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new Error('yt-dlp not installed. Install with: pip install yt-dlp');
      }
      throw error;
    }
  }

  async tryInvidious(channelId, videoId) {
    if (videoId) {
      return await this.getVideoFromInvidious(videoId);
    }
    return await this.getChannelLiveFromInvidious(channelId);
  }

  async getVideoFromInvidious(videoId) {
    for (const instance of this.invidious_instances) {
      try {
        const response = await fetch(`${instance}/api/v1/videos/${videoId}`, {
          timeout: 10000
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        
        return {
          method: 'invidious',
          videoId: data.videoId,
          title: data.title,
          channelName: data.author,
          isLiveNow: data.liveNow === true,
          concurrentViewers: data.viewCount || null,
          thumbnails: data.videoThumbnails?.map(t => ({ url: t.url, width: t.width, height: t.height })) || [],
          description: data.description ? data.description.substring(0, 300) : null,
          actualStartTime: data.published ? new Date(data.published * 1000).toISOString() : null,
          isLiveContent: data.liveNow === true
        };
      } catch (error) {
        continue;
      }
    }
    throw new Error('All Invidious instances failed');
  }

  async getChannelLiveFromInvidious(channelId) {
    for (const instance of this.invidious_instances) {
      try {
        const response = await fetch(`${instance}/api/v1/channels/${channelId}/streams`, {
          timeout: 10000
        });
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const liveStreams = data.filter(video => video.liveNow);
        
        if (liveStreams.length > 0) {
          const stream = liveStreams[0];
          return {
            method: 'invidious',
            videoId: stream.videoId,
            title: stream.title,
            channelName: stream.author,
            isLiveNow: true,
            concurrentViewers: stream.viewCount || null,
            thumbnails: stream.videoThumbnails?.map(t => ({ url: t.url, width: t.width, height: t.height })) || [],
            description: stream.description ? stream.description.substring(0, 300) : null,
            actualStartTime: stream.published ? new Date(stream.published * 1000).toISOString() : null,
            isLiveContent: true
          };
        }
        
        return null; // No live stream found
      } catch (error) {
        continue;
      }
    }
    throw new Error('All Invidious instances failed');
  }

  async tryEnhancedScraping(channelId, videoId) {
    // Import and use the existing enhanced scraping logic
    const { getLiveMetaFromVideoId, resolveLiveVideoIdStrict } = await import('../scripts/live_meta_from_channel.mjs');
    
    try {
      if (videoId) {
        const meta = await getLiveMetaFromVideoId(videoId);
        return { method: 'scraping', ...meta };
      }
      
      const resolvedVideoId = await resolveLiveVideoIdStrict(channelId);
      if (!resolvedVideoId) return null;
      
      const meta = await getLiveMetaFromVideoId(resolvedVideoId);
      return { method: 'scraping', ...meta };
    } catch (error) {
      throw error;
    }
  }

  // Helper method to check which methods are available
  async checkAvailableMethods() {
    const methods = {
      innertube: false,
      ytdlp: false,
      invidious: false,
      scraping: true // Always available
    };

    // Check innerTube
    try {
      await innertubeHelper.init();
      methods.innertube = true;
    } catch (error) {
      // innerTube not available
    }

    // Check yt-dlp
    try {
      execSync('yt-dlp --version', { stdio: 'ignore', timeout: 5000 });
      methods.ytdlp = true;
    } catch (error) {
      // yt-dlp not available
    }

    // Check Invidious instances
    for (const instance of this.invidious_instances) {
      try {
        const response = await fetch(`${instance}/api/v1/stats`, { timeout: 5000 });
        if (response.ok) {
          methods.invidious = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    return methods;
  }

  clearCache() {
    this.cache.clear();
  }
}

export default new YouTubeService();