import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * YT-DLP Helper - Alternative extraction method for bypassing restrictions
 */
class YtDlpHelper {
  constructor() {
    this.cookieFile = '/tmp/youtube_cookies.txt';
    this.setupCookies();
  }

  setupCookies() {
    // Convert browser cookies to Netscape format for yt-dlp
    const youtubeCookies = process.env.YOUTUBE_COOKIES ||
      'YSC=VYj-r2qqIuQ; VISITOR_PRIVACY_METADATA=CgJFUxIhEh0SGwsMDg8QERITFBUWFxgZGhscHR4fICEiIyQlJiA2; PREF=f6=40000000&tz=Europe.Madrid; __Secure-YEC=CgszTjg0M2w2TVBfVSi7mMXGBjInCgJFUxIhEh0SGwsMDg8QERITFBUWFxgZGhscHR4fICEiIyQlJiA2';

    // Convert to Netscape cookie format
    const cookieLines = [
      '# Netscape HTTP Cookie File',
      '# This is a generated file!  Do not edit.',
      ''
    ];

    // Parse and convert cookies
    const cookies = youtubeCookies.split('; ');
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.split('=');
      const value = valueParts.join('='); // Handle values with = in them
      if (name && value) {
        // Format: domain, domain_specified, path, secure, expiration, name, value
        const secure = name.startsWith('__Secure-') ? 'TRUE' : 'FALSE';
        const expiry = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1 year
        // Netscape format: domain \t domain_specified \t path \t secure \t expiry \t name \t value
        cookieLines.push(`.youtube.com\tTRUE\t/\t${secure}\t${expiry}\t${name}\t${value}`);
        cookieLines.push(`youtube.com\tFALSE\t/\t${secure}\t${expiry}\t${name}\t${value}`);
      }
    }

    try {
      fs.writeFileSync(this.cookieFile, cookieLines.join('\n'));
      console.log('YT-DLP: Cookie file created successfully');
    } catch (error) {
      console.error('YT-DLP: Failed to create cookie file:', error.message);
    }
  }

  async getVideoInfo(videoId) {
    try {
      console.log(`YT-DLP: Getting video info for ${videoId}`);

      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const command = [
        'yt-dlp',
        '--dump-json',
        '--no-download',
        '--cookies', this.cookieFile,
        '--user-agent', '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"',
        '--referer', '"https://www.youtube.com/"',
        '--extractor-args', 'youtube:player_client=web',
        videoUrl
      ].join(' ');

      console.log(`YT-DLP: Executing command for ${videoId}`);

      const result = execSync(command, {
        encoding: 'utf8',
        timeout: 15000, // 15 second timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      const videoData = JSON.parse(result);
      console.log(`YT-DLP: Successfully extracted data for ${videoId}`);

      // Check if it's live
      const isLive = videoData.is_live ||
                    videoData.live_status === 'is_live' ||
                    videoData.live_status === 'is_upcoming' ||
                    !!videoData.hls_manifest_url ||
                    !!videoData.dash_manifest_url;

      // Extract thumbnails
      const thumbnails = (videoData.thumbnails || []).map(thumb => ({
        url: thumb.url,
        width: thumb.width || 0,
        height: thumb.height || 0
      }));

      // Calculate live duration if applicable
      let liveDuration = null;
      let liveDurationSeconds = null;
      if (isLive && videoData.release_timestamp) {
        const startTime = new Date(videoData.release_timestamp * 1000);
        const now = new Date();
        liveDurationSeconds = Math.floor((now - startTime) / 1000);

        const hours = Math.floor(liveDurationSeconds / 3600);
        const minutes = Math.floor((liveDurationSeconds % 3600) / 60);
        const seconds = liveDurationSeconds % 60;

        if (hours > 0) {
          liveDuration = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else {
          liveDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
      }

      return {
        method: 'yt-dlp',
        videoId: videoId,
        title: videoData.title || null,
        channelName: videoData.uploader || videoData.channel || null,
        isLiveNow: isLive,
        concurrentViewers: videoData.concurrent_viewer_count || videoData.view_count || null,
        viewerCountType: isLive ? 'concurrent_viewers' : 'total_views',
        thumbnails: thumbnails,
        description: videoData.description ? videoData.description.substring(0, 300) : null,
        actualStartTime: videoData.release_timestamp ? new Date(videoData.release_timestamp * 1000).toISOString() : null,
        isLiveContent: isLive,
        duration: videoData.duration_string || null,
        liveDuration: liveDuration,
        liveDurationSeconds: liveDurationSeconds,
        tags: videoData.tags ? videoData.tags.slice(0, 20) : []
      };

    } catch (error) {
      console.error(`YT-DLP: Failed to get video info for ${videoId}:`, error.message);

      // Check if it's a permission/bot detection error
      if (error.message.includes('Sign in to confirm') ||
          error.message.includes('not a bot') ||
          error.message.includes('This video is unavailable')) {
        console.log(`YT-DLP: Video ${videoId} blocked or unavailable`);
        return null;
      }

      throw error;
    }
  }

  async getLiveInfo(channelId, videoId = null) {
    if (videoId) {
      return await this.getVideoInfo(videoId);
    }

    // For channel detection, we'll rely on other methods
    // yt-dlp is better for individual video extraction
    console.log(`YT-DLP: Channel live detection not implemented, use for video info only`);
    return null;
  }

  cleanup() {
    try {
      if (fs.existsSync(this.cookieFile)) {
        fs.unlinkSync(this.cookieFile);
        console.log('YT-DLP: Cookie file cleaned up');
      }
    } catch (error) {
      console.error('YT-DLP: Failed to cleanup cookie file:', error.message);
    }
  }
}

export default new YtDlpHelper();