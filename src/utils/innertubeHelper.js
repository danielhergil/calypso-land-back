import { Innertube } from 'youtubei.js';

/**
 * InnerTube.js Helper - Uses YouTube's internal API
 * This should provide the most accurate data since it uses the same API as the web interface
 */
class InnerTubeHelper {
  constructor() {
    this.client = null;
  }

  async init() {
    if (!this.client) {
      this.client = await Innertube.create();
    }
    return this.client;
  }

  async getLiveInfo(channelId, videoId = null) {
    try {
      await this.init();

      if (videoId) {
        return await this.getVideoInfo(videoId);
      }

      if (channelId) {
        return await this.getChannelLiveInfo(channelId);
      }

      return null;
    } catch (error) {
      throw new Error(`InnerTube error: ${error.message}`);
    }
  }

  async getVideoInfo(videoId) {
    const info = await this.client.getInfo(videoId);
    
    // Calculate live stream duration if it's live
    // Try multiple sources for start time
    const startTime = info.streaming_data?.live_stream_start_timestamp || 
                     info.basic_info?.start_timestamp ||
                     info.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp;
    
    let liveDuration = null;
    let liveDurationSeconds = null;
    
    if (info.basic_info.is_live && startTime) {
      const startDate = new Date(startTime);
      const now = new Date();
      liveDurationSeconds = Math.floor((now - startDate) / 1000);
      
      // Format duration as HH:MM:SS
      const hours = Math.floor(liveDurationSeconds / 3600);
      const minutes = Math.floor((liveDurationSeconds % 3600) / 60);
      const seconds = liveDurationSeconds % 60;
      
      if (hours > 0) {
        liveDuration = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        liveDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
    }
    
    // Extract tags from keywords
    const tags = info.basic_info.keywords || [];
    
    return {
      method: 'innertube',
      videoId: videoId,
      title: info.basic_info.title,
      channelName: info.basic_info.channel?.name || null,
      isLiveNow: info.basic_info.is_live || false,
      concurrentViewers: info.basic_info.view_count || null,
      viewerCountType: 'total_stream_views', // Not current concurrent viewers
      thumbnails: info.basic_info.thumbnail?.map(t => ({
        url: t.url,
        width: t.width,
        height: t.height
      })) || [],
      description: info.basic_info.short_description ? 
        info.basic_info.short_description.substring(0, 300) : null,
      actualStartTime: startTime || null,
      isLiveContent: info.basic_info.is_live || false,
      duration: info.basic_info.duration?.text || null,
      liveDuration: liveDuration, // Time elapsed since stream started
      liveDurationSeconds: liveDurationSeconds, // Duration in seconds for easy calculation
      tags: tags.slice(0, 20) // Limit to first 20 tags to avoid huge responses
    };
  }

  async getChannelLiveInfo(channelId) {
    try {
      // Get channel info
      const channel = await this.client.getChannel(channelId);
      
      if (!channel) {
        return null;
      }

      // Look for live streams in the channel
      const videos = channel.videos?.contents || [];
      const liveVideo = videos.find(video => 
        video.basic_info?.is_live || 
        video.badges?.some(badge => badge.label?.toLowerCase().includes('live'))
      );

      if (liveVideo && liveVideo.id) {
        const liveInfo = await this.getVideoInfo(liveVideo.id);
        return {
          ...liveInfo,
          channelId: channelId
        };
      }

      return null;
    } catch (error) {
      // Fallback: try to get channel's live page directly
      return null;
    }
  }

  async getViewerCount(channelId, videoId = null) {
    try {
      const info = await this.getLiveInfo(channelId, videoId);
      return info?.concurrentViewers || null;
    } catch (error) {
      return null;
    }
  }

  async isChannelLive(channelId) {
    try {
      const info = await this.getLiveInfo(channelId);
      return info?.isLiveNow === true;
    } catch (error) {
      return false;
    }
  }
}

export default new InnerTubeHelper();