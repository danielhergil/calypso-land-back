import * as cheerio from 'cheerio';

/**
 * Web Scraping Helper for YouTube Live Detection
 * More reliable than Innertube for detecting live streams
 */
class WebScrapingHelper {
  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0'
    ];

    // YouTube consent cookies for Madrid/Spain region
    this.youtubeCookies = process.env.YOUTUBE_COOKIES ||
      'YSC=VYj-r2qqIuQ; VISITOR_PRIVACY_METADATA=CgJFUxIhEh0SGwsMDg8QERITFBUWFxgZGhscHR4fICEiIyQlJiA2; PREF=f6=40000000&tz=Europe.Madrid; __Secure-YEC=CgszTjg0M2w2TVBfVSi7mMXGBjInCgJFUxIhEh0SGwsMDg8QERITFBUWFxgZGhscHR4fICEiIyQlJiA2';
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async fetchWithRetry(url, options = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetching ${url} (attempt ${attempt}/${maxRetries})`);

        const response = await fetch(url, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cookie': this.youtubeCookies,
            'DNT': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-GPC': '1',
            ...options.headers
          },
          ...options
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        console.log(`Attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async getLiveInfo(channelId, videoId = null) {
    if (videoId) {
      return await this.getVideoInfo(videoId);
    }

    if (channelId) {
      return await this.getChannelLiveInfo(channelId);
    }

    return null;
  }

  async getChannelLiveInfo(channelId) {
    try {
      console.log(`Getting live info for channel: ${channelId}`);

      // Method 1: Check /live page directly
      try {
        const livePageUrl = `https://www.youtube.com/channel/${channelId}/live`;
        console.log(`Checking live page: ${livePageUrl}`);

        const response = await this.fetchWithRetry(livePageUrl, { timeout: 15000 });
        const html = await response.text();

        // Check if redirected to a video (indicates live stream)
        if (response.url.includes('/watch?v=')) {
          const videoId = new URL(response.url).searchParams.get('v');
          console.log(`Live page redirected to video: ${videoId}`);

          const videoInfo = await this.getVideoInfo(videoId);
          return {
            ...videoInfo,
            channelId: channelId
          };
        }

        // Parse the live page HTML for live indicators
        const $ = cheerio.load(html);

        // Look for live stream indicators in the page
        const liveElements = $('[class*="live"], [class*="Live"], [id*="live"], [id*="Live"]');
        const scriptTags = $('script').toArray();

        // Search for video ID in scripts
        for (const script of scriptTags) {
          const scriptContent = $(script).html() || '';

          // Look for videoId in ytInitialData or other YouTube data structures
          const videoIdMatch = scriptContent.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (videoIdMatch) {
            const foundVideoId = videoIdMatch[1];
            console.log(`Found potential live video ID in script: ${foundVideoId}`);

            const videoInfo = await this.getVideoInfo(foundVideoId);
            if (videoInfo && videoInfo.isLiveNow) {
              return {
                ...videoInfo,
                channelId: channelId
              };
            }
          }
        }

        console.log('No live stream found on live page');
      } catch (livePageError) {
        console.log('Live page method failed:', livePageError.message);
      }

      // Method 2: Check channel videos page
      try {
        const channelUrl = `https://www.youtube.com/channel/${channelId}/videos`;
        console.log(`Checking channel videos: ${channelUrl}`);

        const response = await this.fetchWithRetry(channelUrl, { timeout: 15000 });
        const html = await response.text();
        const $ = cheerio.load(html);

        // Look for live badges or indicators
        const liveIndicators = [
          'LIVE',
          'live-now',
          'live-badge',
          'ytd-badge[label*="LIVE"]',
          '[aria-label*="live"]',
          '[title*="live"]'
        ];

        const scriptTags = $('script').toArray();

        // Search through all script tags for video data
        for (const script of scriptTags) {
          const scriptContent = $(script).html() || '';

          // Look for live stream indicators in YouTube's data
          if (scriptContent.includes('videoId')) {
            // Extract all video IDs from the page
            const videoIdMatches = scriptContent.match(/"videoId":"([a-zA-Z0-9_-]{11})"/g) || [];

            for (const match of videoIdMatches.slice(0, 1)) {
              const videoId = match.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)[1];
              console.log(`Checking video ID from channel page: ${videoId}`);

              const videoInfo = await this.getVideoInfo(videoId);
              if (videoInfo && videoInfo.isLiveNow) {
                return {
                  ...videoInfo,
                  channelId: channelId
                };
              }
            }
          }
        }

        console.log('No live stream found on channel videos page');
      } catch (channelError) {
        console.log('Channel videos method failed:', channelError.message);
      }

      return null;
    } catch (error) {
      console.error(`Failed to get channel live info for ${channelId}:`, error.message);
      return null;
    }
  }

  async getVideoInfo(videoId) {
    try {
      console.log(`Getting video info for: ${videoId}`);
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const response = await this.fetchWithRetry(videoUrl, { timeout: 15000 });
      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract data from script tags
      const scriptTags = $('script').toArray();
      let videoData = null;
      let isLive = false;
      let title = null;
      let channelName = null;
      let viewCount = null;

      // Search for video data in scripts
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';

        // Look for different YouTube data structures
        if (scriptContent.includes('ytInitialPlayerResponse') ||
            scriptContent.includes('ytInitialData') ||
            scriptContent.includes('isLive') ||
            scriptContent.includes('videoDetails')) {

          try {
            // Try to extract ytInitialPlayerResponse
            let dataMatch = scriptContent.match(/ytInitialPlayerResponse":\s*({.+?})(?=,"ytInitialData"|$)/);
            let dataSource = 'ytInitialPlayerResponse';

            if (!dataMatch) {
              // Try ytInitialData
              dataMatch = scriptContent.match(/ytInitialData":\s*({.+?})\s*;/);
              dataSource = 'ytInitialData';
            }
            if (!dataMatch) {
              // Try window.ytInitialData
              dataMatch = scriptContent.match(/window\.ytInitialData\s*=\s*({.+?});/);
              dataSource = 'window.ytInitialData';
            }
            if (!dataMatch) {
              // Try var ytInitialData
              dataMatch = scriptContent.match(/var ytInitialData\s*=\s*({.+?});/);
              dataSource = 'var ytInitialData';
            }

            if (dataMatch) {
              console.log(`Video ${videoId}: Found ${dataSource}, parsing data...`);
              const jsonStr = dataMatch[1];
              const data = JSON.parse(jsonStr);
              console.log(`Video ${videoId}: Successfully parsed JSON data`);

              // Check videoDetails first
              if (data.videoDetails) {
                isLive = data.videoDetails.isLive || data.videoDetails.isLiveContent || false;
                title = data.videoDetails.title;
                channelName = data.videoDetails.author;
                viewCount = data.videoDetails.viewCount;

                console.log(`Video ${videoId}: live=${isLive}, title="${title}", method=videoDetails`);
              }

              // Check streaming data for live indicators
              if (data.streamingData && !isLive) {
                isLive = !!(data.streamingData.hlsManifestUrl || data.streamingData.dashManifestUrl);
                console.log(`Video ${videoId}: checking streaming data, live=${isLive}`);
              }

              // Check microformat
              if (data.microformat && data.microformat.playerMicroformatRenderer && !isLive) {
                const microformat = data.microformat.playerMicroformatRenderer;
                isLive = microformat.isLiveContent || microformat.liveBroadcastDetails?.isLiveNow || false;
                console.log(`Video ${videoId}: checking microformat, live=${isLive}`);
              }

              if (isLive) {
                // Extract additional metadata from the same data object
                let thumbnails = [];
                let description = null;
                let duration = null;
                let tags = [];

                // Extract thumbnails
                if (data.videoDetails && data.videoDetails.thumbnail && data.videoDetails.thumbnail.thumbnails) {
                  thumbnails = data.videoDetails.thumbnail.thumbnails.map(t => ({
                    url: t.url,
                    width: t.width,
                    height: t.height
                  }));
                }

                // Extract description
                if (data.videoDetails && data.videoDetails.shortDescription) {
                  description = data.videoDetails.shortDescription.substring(0, 300);
                }

                // Extract tags/keywords
                if (data.videoDetails && data.videoDetails.keywords) {
                  tags = data.videoDetails.keywords.slice(0, 20);
                }

                // Calculate live duration if start time is available
                let liveDuration = null;
                let liveDurationSeconds = null;
                if (data.microformat && data.microformat.playerMicroformatRenderer) {
                  const microformat = data.microformat.playerMicroformatRenderer;
                  const startTime = microformat.liveBroadcastDetails?.startTimestamp;
                  if (startTime) {
                    const startDate = new Date(startTime);
                    const now = new Date();
                    liveDurationSeconds = Math.floor((now - startDate) / 1000);

                    const hours = Math.floor(liveDurationSeconds / 3600);
                    const minutes = Math.floor((liveDurationSeconds % 3600) / 60);
                    const seconds = liveDurationSeconds % 60;

                    if (hours > 0) {
                      liveDuration = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    } else {
                      liveDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    }
                  }
                }

                return {
                  method: 'webscraping',
                  videoId: videoId,
                  title: title,
                  channelName: channelName,
                  isLiveNow: true,
                  concurrentViewers: viewCount ? parseInt(viewCount) : null,
                  viewerCountType: 'concurrent_viewers',
                  thumbnails: thumbnails,
                  description: description,
                  isLiveContent: true,
                  duration: duration,
                  liveDuration: liveDuration,
                  liveDurationSeconds: liveDurationSeconds,
                  tags: tags,
                  actualStartTime: data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.startTimestamp || null
                };
              }
            }

            // Also check for direct isLive mentions in the script
            if (!isLive && scriptContent.includes('"isLive":true')) {
              console.log(`Video ${videoId}: found direct isLive:true in script`);
              isLive = true;
            }

            // Additional live indicators for robust detection
            if (!isLive) {
              const livePatterns = [
                /"isLiveNow"\s*:\s*true/,
                /"isLive"\s*:\s*true/,
                /"liveBroadcastContent"\s*:\s*"live"/,
                /"hlsManifestUrl"\s*:\s*"[^"]+"/,
                /"dashManifestUrl"\s*:\s*"[^"]+"/
              ];

              for (const pattern of livePatterns) {
                if (pattern.test(scriptContent)) {
                  console.log(`Video ${videoId}: found live pattern: ${pattern.source}`);
                  isLive = true;
                  break;
                }
              }
            }

            console.log(`Video ${videoId}: Final live status: ${isLive}`);

          } catch (parseError) {
            console.log(`Failed to parse video data JSON for ${videoId}:`, parseError.message);
            console.log(`Video ${videoId}: Will try fallback detection methods`);
            // Continue to fallback methods
          }
        } else {
          console.log(`Video ${videoId}: No YouTube data structures found in script`);
        }
      }

      // Fallback: Check for live indicators in the HTML
      const liveIndicators = $('.ytp-live', '.live-badge', '[class*="live"]', '[id*="live"]');
      const hasLiveIndicator = liveIndicators.length > 0;

      // Check page title for live indicators
      const pageTitle = $('title').text();
      const titleHasLive = /live/i.test(pageTitle);

      if (hasLiveIndicator || titleHasLive) {
        console.log(`Video ${videoId} appears to be live based on HTML indicators`);
        isLive = true;
      }

      return {
        method: 'webscraping',
        videoId: videoId,
        title: title || $('title').text().replace(' - YouTube', ''),
        channelName: channelName,
        isLiveNow: isLive,
        concurrentViewers: viewCount ? parseInt(viewCount) : null,
        viewerCountType: isLive ? 'concurrent_viewers' : 'total_views',
        thumbnails: [],
        description: null,
        isLiveContent: isLive,
        duration: null,
        liveDuration: null,
        liveDurationSeconds: null,
        tags: [],
        actualStartTime: null
      };

    } catch (error) {
      console.error(`Failed to get video info for ${videoId}:`, error.message);
      return null;
    }
  }
}

export default new WebScrapingHelper();