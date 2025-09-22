import ytdl from 'ytdl-core';
import webScrapingHelper from './webScrapingHelper.js';

/**
 * YTDL-Core Helper - Fast status checking
 * This should provide quick live status checks without hanging
 */
class YTDLHelper {
  constructor() {
    // No client initialization needed
  }

  buildRequestConfig(target) {
    const isAbsoluteUrl = /^https?:\/\//i.test(target);
    const baseUrl = isAbsoluteUrl ? target : `https://www.youtube.com/watch?v=${target}`;
    const { url, headers } = webScrapingHelper.buildYoutubeRequest(baseUrl);

    return {
      url,
      options: {
        requestOptions: {
          headers
        }
      }
    };
  }

  async isChannelLive(channelId) {
    try {
      console.log(`YTDL: Checking if channel ${channelId} is live...`);

      // Try to get channel live page directly
      const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
      const requestConfig = this.buildRequestConfig(liveUrl);

      // Use ytdl to check if the live URL redirects to a video
      const isLive = await Promise.race([
        this.checkLiveUrl(requestConfig),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('YTDL timeout')), 3000)
        )
      ]);

      console.log(`YTDL: Channel ${channelId} live status: ${isLive}`);
      return isLive;
    } catch (error) {
      console.log(`YTDL: Failed to check channel ${channelId}:`, error.message);
      return false;
    }
  }

  async checkLiveUrl(requestConfig) {
    try {
      // Try to validate the live URL - if it's live, it should redirect to a video
      const isValid = await ytdl.validateURL(requestConfig.url);
      if (isValid) {
        // If the live URL is valid, try to get basic info
        const info = await ytdl.getBasicInfo(requestConfig.url, requestConfig.options);

        // Check if it's actually live
        const isLive = info?.videoDetails?.isLiveContent &&
                      !info?.videoDetails?.isUpcoming &&
                      info?.videoDetails?.liveBroadcastDetails?.isLiveNow;

        return !!isLive;
      }
      return false;
    } catch (error) {
      // If we can't get info, try alternative approach
      return await this.checkLiveByVideoId(requestConfig);
    }
  }

  async checkLiveByVideoId(requestConfig) {
    try {
      // Extract video ID if the live URL redirected to a video
      const videoInfo = await ytdl.getInfo(requestConfig.url, requestConfig.options);

      if (videoInfo?.videoDetails) {
        const isLive = videoInfo.videoDetails.isLiveContent &&
                      !videoInfo.videoDetails.isUpcoming &&
                      videoInfo.videoDetails.liveBroadcastDetails?.isLiveNow;

        return !!isLive;
      }
      return false;
    } catch (error) {
      console.log('YTDL: Video check failed:', error.message);
      return false;
    }
  }

  async getLiveVideoId(channelId) {
    try {
      console.log(`YTDL: Getting live video ID for channel ${channelId}`);

      const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
      const requestConfig = this.buildRequestConfig(liveUrl);

      // Try to get the video info from live URL
      const videoInfo = await Promise.race([
        ytdl.getInfo(requestConfig.url, requestConfig.options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('YTDL getInfo timeout')), 2000)
        )
      ]);

      if (videoInfo?.videoDetails?.videoId) {
        const videoId = videoInfo.videoDetails.videoId;
        const isLive = videoInfo.videoDetails.isLiveContent &&
                      !videoInfo.videoDetails.isUpcoming &&
                      videoInfo.videoDetails.liveBroadcastDetails?.isLiveNow;

        if (isLive) {
          console.log(`YTDL: Found live video ${videoId}`);
          return videoId;
        }
      }

      return null;
    } catch (error) {
      console.log(`YTDL: Failed to get live video ID:`, error.message);
      return null;
    }
  }

  async getQuickLiveInfo(channelId) {
    try {
      console.log(`YTDL: Getting quick live info for channel ${channelId}`);

      const videoId = await this.getLiveVideoId(channelId);
      if (!videoId) {
        return null;
      }

      // Get basic video info
      const videoRequest = this.buildRequestConfig(videoId);

      const info = await Promise.race([
        ytdl.getBasicInfo(videoRequest.url, videoRequest.options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('YTDL basic info timeout')), 2000)
        )
      ]);

      if (info?.videoDetails) {
        const details = info.videoDetails;

        return {
          method: 'ytdl-core',
          videoId: videoId,
          channelId: channelId,
          title: details.title,
          channelName: details.author,
          isLiveNow: details.isLiveContent && !details.isUpcoming &&
                    details.liveBroadcastDetails?.isLiveNow,
          concurrentViewers: details.viewCount ? parseInt(details.viewCount) : null,
          viewerCountType: 'concurrent_viewers',
          thumbnails: details.thumbnails || [],
          description: details.description ? details.description.substring(0, 300) : null,
          isLiveContent: details.isLiveContent || false,
          duration: details.lengthSeconds ? `${details.lengthSeconds}s` : null
        };
      }

      return null;
    } catch (error) {
      console.log(`YTDL: Failed to get quick live info:`, error.message);
      return null;
    }
  }
}

export default new YTDLHelper();