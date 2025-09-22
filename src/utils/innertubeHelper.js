import { Innertube } from 'youtubei.js';

/**
 * InnerTube.js Helper - Uses YouTube's internal API
 * This should provide the most accurate data since it uses the same API as the web interface
 */
class InnerTubeHelper {
  constructor() {
    this.client = null;
    this.initPromise = null;
  }

  async init() {
    if (!this.client && !this.initPromise) {
      this.initPromise = this._initializeClient();
    }

    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch (error) {
        console.error('Innertube initialization failed during init():', error.message);
        // Clear the failed promise so it can be retried
        this.initPromise = null;
        throw error;
      }
    }

    if (!this.client) {
      throw new Error('Innertube client not available after initialization');
    }

    return this.client;
  }

  async _initializeClient() {
    try {
      console.log('Initializing Innertube client...');

      // YouTube consent cookies for cloud environments
      const youtubeCookies = process.env.YOUTUBE_COOKIES ||
        'YSC=VYj-r2qqIuQ; VISITOR_PRIVACY_METADATA=CgJFUxIhEh0SGwsMDg8QERITFBUWFxgZGhscHR4fICEiIyQlJiA2; PREF=f6=40000000&tz=Europe.Madrid; __Secure-YEC=CgszTjg0M2w2TVBfVSi7mMXGBjInCgJFUxIhEh0SGwsMDg8QERITFBUWFxgZGhscHR4fICEiIyQlJiA2';

      // Configure Innertube with enhanced settings for cloud environments
      const innertubeConfig = {
        visitor_data: undefined,
        enable_session_cache: true,
        language: 'en',
        location: 'ES',
        cookie: youtubeCookies,
        client_name: 'WEB',
        client_version: '2.20250919.00.00',

        // Enhanced browser mimicking for cloud environments
        initial_cookie: youtubeCookies,

        // Add session context that matches real browser behavior
        session: {
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20250919.00.00',
              gl: 'ES',
              hl: 'en',
              userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
              originalUrl: 'https://www.youtube.com/',
              platform: 'DESKTOP',
              clientFormFactor: 'UNKNOWN_FORM_FACTOR',
              browserName: 'Chrome',
              browserVersion: '127.0.0.0',
              osName: 'Windows',
              osVersion: '10.0',
              screenPixelDensity: 1,
              screenDensityFloat: 1,
              utcOffsetMinutes: 120
            },
            user: {
              lockedSafetyMode: false
            },
            request: {
              useSsl: true,
              internalExperimentFlags: [],
              consistencyTokenJars: []
            }
          }
        }
      };

      console.log('Creating Innertube client with Spanish locale and consent cookies...');

      // Add timeout to client initialization with longer timeout for cloud environments
      const initTimeout = process.env.NODE_ENV === 'production' ? 10000 : 5000;
      console.log(`Setting Innertube initialization timeout to ${initTimeout}ms`);

      this.client = await Promise.race([
        Innertube.create(innertubeConfig),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Innertube client initialization timeout after ${initTimeout}ms`)), initTimeout)
        )
      ]);

      console.log('Innertube client initialized successfully with cookies');
      this.initPromise = null; // Clear the promise after successful initialization
    } catch (error) {
      console.error('Failed to initialize Innertube client:', error.message);
      this.initPromise = null; // Clear the promise on error so it can be retried
      throw error;
    }
  }

  async getLiveInfo(channelId, videoId = null, channelHandle = null) {
    try {
      await this.init();

      if (videoId) {
        return await this.getVideoInfo(videoId);
      }

      if (channelId) {
        return await this.getChannelLiveInfo(channelId);
      }

      if (channelHandle) {
        return await this.getChannelLiveInfoByHandle(channelHandle);
      }

      return null;
    } catch (error) {
      throw new Error(`InnerTube error: ${error.message}`);
    }
  }

  async getVideoInfo(videoId) {
    let info;
    try {
      console.log(`Getting video info for: ${videoId}`);
      const startTime = Date.now();

      // Add timeout to video info request
      info = await Promise.race([
        this.client.getInfo(videoId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Video info timeout')), 3000))
      ]);

      console.log(`Retrieved info for video: ${videoId} in ${Date.now() - startTime}ms`);
      console.log(`Basic info: title="${info.basic_info?.title}", live=${info.basic_info?.is_live}`);
    } catch (error) {
      console.error(`Failed to get video info for ${videoId}:`, error.message);
      return null;
    }
    
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
    
    // Try to get concurrent viewers from multiple sources
    let concurrentViewers = null;
    let viewerCountType = 'unknown';
    
    if (info.basic_info.is_live) {
      // For live streams, try to get concurrent viewers
      concurrentViewers = info.live_stream_data?.watching_count || 
                         info.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.concurrentViewers ||
                         info.streaming_data?.concurrent_viewers ||
                         null;
      viewerCountType = concurrentViewers ? 'concurrent_viewers' : 'total_stream_views';
    } else {
      // For non-live content, use view count
      concurrentViewers = info.basic_info.view_count || null;
      viewerCountType = 'total_views';
    }
    
    return {
      method: 'innertube',
      videoId: videoId,
      title: info.basic_info.title,
      channelName: info.basic_info.channel?.name || null,
      isLiveNow: info.basic_info.is_live || false,
      concurrentViewers: concurrentViewers,
      viewerCountType: viewerCountType,
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
      console.log(`Getting live info for channel: ${channelId}`);
      const startTime = Date.now();

      // Set overall timeout for the entire operation (max 5 seconds total)
      const globalTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Overall timeout - channel likely offline')), 5000)
      );

      const checkLiveInfo = async () => {
        // Method 1: Fast live page check first (quickest way to determine if offline)
        try {
          console.log('Trying fast live page check...');
          const livePageVideoId = await Promise.race([
            this.getLivePageVideoId(channelId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Fast timeout')), 1500))
          ]);

          if (livePageVideoId) {
            console.log(`Found live video via fast live page: ${livePageVideoId}`);
            const liveInfo = await this.getVideoInfo(livePageVideoId);
            if (liveInfo && liveInfo.isLiveNow) {
              const liveChatData = await this.getLiveChatData(livePageVideoId);
              return {
                ...liveInfo,
                channelId: channelId,
                liveChatEnabled: !!liveChatData,
                liveChat: liveChatData
              };
            }
          }
        } catch (fastError) {
          console.log('Fast live page check failed:', fastError.message);
        }

        // Method 2: Direct search approach using InnerTube's search (with shorter timeout)
        try {
          console.log('Trying direct search approach...');
          const searchResults = await Promise.race([
            this.client.search(`${channelId} live`, { type: 'video' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), 2000))
          ]);

          if (searchResults && searchResults.contents) {
            for (const result of searchResults.contents) {
              if (result && result.id && result.basic_info) {
                // Check if this video is from the target channel and is live
                const channelMatch = result.basic_info.channel?.id === channelId;
                const isLive = result.basic_info.is_live ||
                              result.badges?.some(badge =>
                                badge && badge.label && badge.label.toLowerCase().includes('live'));

                if (channelMatch && isLive) {
                  console.log(`Found live video via search: ${result.id}`);
                  const videoInfo = await this.getVideoInfo(result.id);
                  if (videoInfo && videoInfo.isLiveNow) {
                    return {
                      ...videoInfo,
                      channelId: channelId,
                      liveChatEnabled: true
                    };
                  }
                }
              }
            }
          }
        } catch (searchError) {
          console.log('Search method failed:', searchError.message);
        }

        // Early return if methods above took too long
        if (Date.now() - startTime > 4000) {
          console.log('Early timeout - skipping remaining methods');
          return null;
        }

        // Method 3: Try live page approach (only if we have time)
        if (Date.now() - startTime < 5000) {
          try {
            console.log('Trying live page approach...');
            const livePageVideoId = await Promise.race([
              this.getLivePageVideoId(channelId),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Live page timeout')), 1500))
            ]);
            if (livePageVideoId) {
              console.log(`Found live video via live page: ${livePageVideoId}`);
              const liveInfo = await this.getVideoInfo(livePageVideoId);
              if (liveInfo && liveInfo.isLiveNow) {
                const liveChatData = await this.getLiveChatData(livePageVideoId);
                return {
                  ...liveInfo,
                  channelId: channelId,
                  liveChatEnabled: !!liveChatData,
                  liveChat: liveChatData
                };
              }
            }
          } catch (livePageError) {
            console.log('Live page method failed:', livePageError.message);
          }
        }

        // Method 4: Get channel and look for live videos (final attempt)
        if (Date.now() - startTime < 6000) {
          try {
            console.log('Trying channel approach...');
            const channel = await Promise.race([
              this.client.getChannel(channelId),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Channel fetch timeout')), 2000))
            ]);

            if (!channel) {
              console.log('Channel not found');
              return null;
            }

            console.log('Channel retrieved, looking for live content...');
            console.log(`Channel sections available: ${Object.keys(channel).join(', ')}`);
            console.log(`Live streams section: ${!!channel.live_streams}, Videos section: ${!!channel.videos}`);

            // Check live_streams section first
            if (channel.live_streams && channel.live_streams.contents) {
              console.log(`Found ${channel.live_streams.contents.length} entries in live_streams`);
              for (const video of channel.live_streams.contents.slice(0, 3)) { // Limit to first 3
                if (video && video.id) {
                  console.log(`Checking live stream: ${video.id}`);
                  const videoInfo = await this.getVideoInfo(video.id);
                  if (videoInfo && videoInfo.isLiveNow) {
                    console.log(`Confirmed live video: ${video.id}`);
                    const liveChatData = await this.getLiveChatData(video.id);
                    return {
                      ...videoInfo,
                      channelId: channelId,
                      liveChatEnabled: !!liveChatData,
                      liveChat: liveChatData
                    };
                  }
                }
              }
            }

            // Check regular videos section (more aggressively if no live_streams section)
            const maxVideosToCheck = channel.live_streams ? 5 : 10; // More videos if no live_streams
            const timeLimit = channel.live_streams ? 7000 : 10000; // More time if no live_streams
            const timeRemaining = timeLimit - (Date.now() - startTime);

            console.log(`Video section debug: videos=${!!channel.videos}, contents=${!!channel.videos?.contents}, count=${channel.videos?.contents?.length || 0}, timeRemaining=${timeRemaining}ms`);

            // If videos section is empty, try search approach instead
            if ((!channel.videos || !channel.videos.contents || channel.videos.contents.length === 0) && Date.now() - startTime < timeLimit) {
              console.log('Videos section empty, trying search approach for live content...');
              try {
                const searchResults = await Promise.race([
                  this.client.search(`${channelId} live`, { type: 'video' }),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Search timeout')), 3000))
                ]);

                if (searchResults && searchResults.contents) {
                  for (const result of searchResults.contents.slice(0, 5)) {
                    if (result && result.id && result.basic_info) {
                      const channelMatch = result.basic_info.channel?.id === channelId;
                      const isLive = result.basic_info.is_live ||
                                    result.badges?.some(badge =>
                                      badge && badge.label && badge.label.toLowerCase().includes('live'));

                      if (channelMatch && isLive) {
                        console.log(`Found live video via search: ${result.id}`);
                        const videoInfo = await this.getVideoInfo(result.id);
                        if (videoInfo && videoInfo.isLiveNow) {
                          return {
                            ...videoInfo,
                            channelId: channelId,
                            liveChatEnabled: true
                          };
                        }
                      }
                    }
                  }
                }
              } catch (searchError) {
                console.log('Search approach failed:', searchError.message);
              }
            }

            if (channel.videos && channel.videos.contents && Date.now() - startTime < timeLimit) {
              console.log(`Checking first ${maxVideosToCheck} videos for live content (live_streams available: ${!!channel.live_streams})`);
              const videosToCheck = channel.videos.contents.slice(0, maxVideosToCheck);

              for (const video of videosToCheck) {
                if (!video || !video.id) continue;

                const isLive = video.basic_info?.is_live;
                const hasLiveBadge = video.badges?.some(badge =>
                  badge && badge.label && badge.label.toLowerCase().includes('live')
                );

                if (isLive || hasLiveBadge) {
                  const videoInfo = await this.getVideoInfo(video.id);
                  if (videoInfo && videoInfo.isLiveNow) {
                    console.log(`Confirmed live video: ${video.id}`);
                    const liveChatData = await this.getLiveChatData(video.id);
                    return {
                      ...videoInfo,
                      channelId: channelId,
                      liveChatEnabled: !!liveChatData,
                      liveChat: liveChatData
                    };
                  }
                }
              }
            }

            console.log(`No live content found in channel (total time: ${Date.now() - startTime}ms)`);

            // If channel access worked but no videos were found, this might be due to YouTube restrictions
            // Return null to allow web scraping fallback, which might be more successful
            if (channel && (!channel.videos || !channel.videos.contents || channel.videos.contents.length === 0)) {
              console.log('Channel accessible but videos section empty - allowing web scraping fallback');
              return null;
            }

            // Return a proper "not live" response when we successfully checked the channel content
            return {
              method: 'innertube',
              videoId: null,
              title: null,
              channelName: null,
              channelId: channelId,
              isLiveNow: false,
              concurrentViewers: null,
              viewerCountType: 'not_live',
              thumbnails: [],
              description: null,
              isLiveContent: false,
              duration: null,
              liveDuration: null,
              liveDurationSeconds: null,
              tags: [],
              actualStartTime: null
            };

          } catch (channelError) {
            console.log('Channel method failed:', channelError.message);
            return null;
          }
        }

        // Return "not live" response when all methods are exhausted but channel was accessible
        return {
          method: 'innertube',
          videoId: null,
          title: null,
          channelName: null,
          channelId: channelId,
          isLiveNow: false,
          concurrentViewers: null,
          viewerCountType: 'not_live',
          thumbnails: [],
          description: null,
          isLiveContent: false,
          duration: null,
          liveDuration: null,
          liveDurationSeconds: null,
          tags: [],
          actualStartTime: null
        };
      };

      // Race the main logic against the global timeout
      return await Promise.race([
        checkLiveInfo(),
        globalTimeoutPromise
      ]);

    } catch (error) {
      console.error(`Failed to get channel live info for ${channelId}:`, error.message);
      return null;
    }
  }

  async getChannelLiveInfoByHandle(handle) {
    try {
      console.log(`Getting live info for channel handle: ${handle}`);

      // Remove @ if present
      const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

      // Search for the channel by handle
      const searchResults = await this.client.search(`@${cleanHandle}`, { type: 'channel' });

      if (searchResults && searchResults.contents) {
        for (const result of searchResults.contents) {
          if (result && result.id && (result.basic_info?.handle === `@${cleanHandle}` ||
              result.basic_info?.name?.toLowerCase().includes(cleanHandle.toLowerCase()))) {
            console.log(`Found channel by handle: ${result.id}`);
            return await this.getChannelLiveInfo(result.id);
          }
        }
      }

      console.log(`Channel not found for handle: ${handle}`);
      return null;
    } catch (error) {
      console.error(`Failed to get channel by handle ${handle}:`, error.message);
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

  async getLivePageVideoId(channelId) {
    try {
      console.log(`Checking live page for: ${channelId}`);

      // Try different approaches to get the live page video with shorter timeouts
      const livePageUrl = `https://www.youtube.com/channel/${channelId}/live`;

      try {
        // Method 1: Try getBasicInfo with fast timeout
        const livePageResponse = await Promise.race([
          this.client.getBasicInfo(livePageUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Live page getBasicInfo timeout')), 1200))
        ]);

        if (livePageResponse && livePageResponse.basic_info && livePageResponse.basic_info.id) {
          console.log(`Live page found video via getBasicInfo: ${livePageResponse.basic_info.id}`);
          return livePageResponse.basic_info.id;
        }
      } catch (basicInfoError) {
        console.log('getBasicInfo method failed:', basicInfoError.message);
      }

      try {
        // Method 2: Try resolveURL with fast timeout
        const resolvedUrl = await Promise.race([
          this.client.resolveURL(livePageUrl),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Live page resolveURL timeout')), 1200))
        ]);

        if (resolvedUrl && resolvedUrl.basic_info && resolvedUrl.basic_info.id) {
          console.log(`Live page found video via resolveURL: ${resolvedUrl.basic_info.id}`);
          return resolvedUrl.basic_info.id;
        }
      } catch (resolveError) {
        console.log('resolveURL method failed:', resolveError.message);
      }

      return null;
    } catch (error) {
      console.log('Live page check failed:', error.message);
      return null;
    }
  }

  async getLiveChatData(videoId) {
    try {
      console.log(`Getting live chat data for video: ${videoId}`);

      // Get the video info first to check if live chat is available
      const videoInfo = await this.client.getInfo(videoId);

      if (!videoInfo.basic_info.is_live) {
        console.log(`Video ${videoId} is not live, no chat available`);
        return null;
      }

      // Try to get live chat
      const liveChat = await this.client.getLiveChat(videoId);

      if (liveChat) {
        console.log(`Live chat available for video: ${videoId}`);

        // Get recent messages (last 10)
        const messages = [];
        let messageCount = 0;

        try {
          for await (const message of liveChat) {
            if (messageCount >= 10) break;

            messages.push({
              id: message.id,
              author: {
                name: message.author?.name,
                channelId: message.author?.channel_id,
                badges: message.author?.badges?.map(badge => badge.label)
              },
              text: message.text?.simpleText || message.text?.runs?.map(run => run.text).join(''),
              timestamp: message.timestamp,
              timestampUsec: message.timestamp_usec
            });

            messageCount++;
          }
        } catch (chatError) {
          console.log('Error reading chat messages:', chatError.message);
        }

        return {
          isEnabled: true,
          messageCount: messages.length,
          recentMessages: messages,
          chatId: liveChat.continuation || null
        };
      }

      return null;
    } catch (error) {
      console.log(`Failed to get live chat for ${videoId}:`, error.message);
      return null;
    }
  }

  async getLiveStats(videoId) {
    try {
      console.log(`Getting live stats for video: ${videoId}`);

      const info = await this.client.getInfo(videoId);

      if (!info.basic_info.is_live) {
        return null;
      }

      // Extract live streaming data
      const liveStreamingDetails = info.streaming_data?.live_streaming_details || {};
      const liveData = info.live_stream_data || {};

      return {
        concurrentViewers: liveData.watching_count || info.basic_info.view_count,
        isLive: true,
        startTimestamp: liveStreamingDetails.actual_start_time || info.streaming_data?.live_stream_start_timestamp,
        scheduledStartTime: liveStreamingDetails.scheduled_start_time,
        endTimestamp: liveStreamingDetails.actual_end_time,
        manifestUrl: info.streaming_data?.hls_manifest_url,
        dashManifestUrl: info.streaming_data?.dash_manifest_url,
        isLowLatencyLiveStream: liveStreamingDetails.is_low_latency_live_stream || false
      };
    } catch (error) {
      console.log(`Failed to get live stats for ${videoId}:`, error.message);
      return null;
    }
  }
}

export default new InnerTubeHelper();