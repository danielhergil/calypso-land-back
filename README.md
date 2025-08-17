# YouTube Metadata API Server

A high-performance, production-ready backend server for retrieving YouTube video and channel metadata through web scraping. Built with Express.js and designed to handle multiple concurrent users with proper rate limiting, caching, and error handling.

## Features

- 🚀 **High Performance**: Built for concurrent user connections
- 🛡️ **Rate Limiting**: Prevents abuse with configurable limits
- 💾 **Intelligent Caching**: Reduces API calls with TTL-based caching
- 📊 **Comprehensive Logging**: Winston-based logging with rotation
- 🔒 **Security**: Helmet.js, CORS, and input validation
- 📈 **Monitoring**: Health check endpoint with metrics
- 🐳 **Production Ready**: Environment-based configuration

## API Endpoints

### Get Video Metadata
```
GET /api/youtube/video/:videoId
```
Retrieves metadata for a specific YouTube video.

**Example:**
```bash
curl http://localhost:3001/api/youtube/video/3ln7wgHJ7eU
```

### Get Channel Live Stream
```
GET /api/youtube/channel/:channelId
```
Retrieves current live stream metadata for a channel.

**Example:**
```bash
curl http://localhost:3001/api/youtube/channel/UCxxxxxxxxxxxxxxxxxxxxxx
```

### Health Check
```
GET /api/youtube/health
```
Returns server health and cache statistics.

## Installation & Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Create environment file:**
```bash
cp .env.example .env
```

3. **Configure environment variables in `.env`:**
```env
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://yourdomain.com
CACHE_TTL=300
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
```

4. **Start the server:**
```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3001` | Server port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `CACHE_TTL` | `300` | Cache TTL in seconds |
| `RATE_LIMIT_WINDOW` | `900000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `LOG_LEVEL` | `info` | Logging level |

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "mode": "video",
    "videoId": "3ln7wgHJ7eU",
    "isLiveNow": true,
    "title": "Video Title",
    "channelName": "Channel Name",
    "concurrentViewers": 9,
    "actualStartTime": "2025-08-13T14:15:12+00:00",
    "description": "Video description...",
    "thumbnails": [...],
    "tags": [...],
    "category": "Music"
  },
  "cached": false,
  "timestamp": "2025-08-17T10:30:00.000Z"
}
```

### Error Response
```json
{
  "error": {
    "message": "Error description",
    "status": 400,
    "timestamp": "2025-08-17T10:30:00.000Z"
  }
}
```

## Architecture

```
server/
├── src/
│   ├── config/          # Environment and logger configuration
│   ├── middleware/      # Express middleware (auth, validation, etc.)
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic and external services
│   ├── utils/           # Utility functions and helpers
│   └── index.js         # Application entry point
├── logs/                # Log files
└── package.json
```

## Performance Optimizations

- **Caching**: Intelligent caching with TTL to reduce script executions
- **Rate Limiting**: Multiple rate limiters for different endpoints
- **Compression**: Gzip compression for responses
- **Request Logging**: Structured logging for monitoring
- **Graceful Shutdown**: Proper cleanup on process termination

## Monitoring & Logs

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only
- Console output in development

Log rotation is configured with max file size of 5MB and 5 backup files.

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin requests
- **Input Validation**: Parameter validation for video/channel IDs
- **Rate Limiting**: Protection against abuse
- **Error Handling**: Safe error responses without stack traces in production

## Dependencies

### Production
- `express` - Web framework
- `helmet` - Security middleware
- `cors` - CORS handling
- `compression` - Response compression
- `winston` - Logging
- `node-cache` - In-memory caching
- `express-rate-limit` - Rate limiting
- `express-validator` - Input validation
- `dotenv` - Environment variables

### Development
- `eslint` - Code linting
- `prettier` - Code formatting

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm test` - Run tests

## Deployment

1. Set `NODE_ENV=production`
2. Configure production environment variables
3. Ensure the YouTube metadata script is accessible at the expected path
4. Use a process manager like PM2 for production deployment
5. Set up log rotation and monitoring
6. Configure reverse proxy (nginx) if needed

## Rate Limits

- **General API**: 100 requests per 15 minutes
- **Strict endpoints**: 10 requests per minute for video/channel endpoints

## Error Codes

- `400` - Bad Request (invalid parameters)
- `404` - Not Found (invalid route)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Use conventional commit messages