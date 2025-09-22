import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { config } from './config/environment.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import youtubeRoutes from './routes/youtube.js';
import statusRoutes from './routes/status.js';
import logger from './config/logger.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestLogger);
app.use(apiRateLimiter);

app.get('/', (req, res) => {
  res.json({
    message: 'YouTube Metadata API Server',
    version: '1.0.2',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      video: '/api/youtube/video/:videoId (cached)',
      channel: '/api/youtube/channel/:channelId (cached)',
      channelByHandle: '/api/youtube/handle/:handle (cached)',
      status: '/api/youtube/status/:channelId (cached)',
      viewers: '/api/youtube/viewers/:channelId (cached)',
      liveChat: '/api/youtube/livechat/:videoId (live chat messages)',
      liveStats: '/api/youtube/livestats/:videoId (live streaming stats)',
      statusVideo: '/api/status/video/:videoId (check if live)',
      statusChannel: '/api/status/channel/:channelId (check if live)',
      statusBatch: '/api/status/batch/videos (check multiple videos)',
      statusBatchChannels: '/api/status/batch/channels (check multiple channels with video data)',
      batchVideos: '/api/youtube/batch/videos (get multiple video metadata)',
      quickStatus: '/api/youtube/quick-status/:channelId (ultra-fast YTDL status)',
      health: '/api/youtube/health',
      clearCache: '/api/youtube/cache/clear (POST)'
    }
  });
});

app.use('/api/youtube', youtubeRoutes);
app.use('/api/status', statusRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  server.close(() => {
    logger.info('Process terminated gracefully');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const server = app.listen(config.PORT, () => {
  logger.info({
    message: 'Server started successfully',
    port: config.PORT,
    environment: config.NODE_ENV,
    corsOrigin: config.CORS_ORIGIN
  });
});

export default app;