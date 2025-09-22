FROM node:20-alpine

WORKDIR /app

# Install system dependencies including yt-dlp
RUN apk add --no-cache python3 py3-pip ffmpeg curl git && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --upgrade pip && \
    /opt/venv/bin/pip install yt-dlp && \
    ln -sf /opt/venv/bin/yt-dlp /usr/local/bin/yt-dlp

# Add virtual environment to PATH
ENV PATH="/opt/venv/bin:$PATH"

# Set Node.js options to enable experimental features for undici compatibility
ENV NODE_OPTIONS="--experimental-global-webcrypto --experimental-fetch"

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port (Cloud Run will override this)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]