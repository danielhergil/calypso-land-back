import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_PATH = join(__dirname, '../scripts/live_meta_from_channel.mjs');

export class YouTubeMetadataService {
  static async getVideoMetadata(videoId) {
    return this._executeScript(['--video', videoId]);
  }

  static async getChannelMetadata(channelId) {
    if (!channelId.startsWith('UC')) {
      throw new Error('Channel ID must start with "UC"');
    }
    return this._executeScript(['--channel', channelId]);
  }

  static _executeScript(args) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      logger.info({ message: 'Executing YouTube metadata script', args });

      const child = spawn('node', [SCRIPT_PATH, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          try {
            const result = JSON.parse(stdout.trim());
            logger.info({ 
              message: 'YouTube metadata script completed successfully', 
              duration: `${duration}ms`,
              resultMode: result.mode
            });
            resolve(result);
          } catch (parseError) {
            logger.error({
              message: 'Failed to parse script output',
              stdout,
              parseError: parseError.message
            });
            reject(new Error('Invalid JSON response from metadata script'));
          }
        } else if (code === 3) {
          logger.info({ 
            message: 'Channel not live', 
            duration: `${duration}ms`,
            args 
          });
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch {
            resolve({
              mode: 'channel',
              channelId: args[1],
              isLiveNow: false,
              note: 'Channel is not currently live'
            });
          }
        } else {
          logger.error({
            message: 'YouTube metadata script failed',
            code,
            stderr,
            stdout,
            duration: `${duration}ms`,
            args
          });
          reject(new Error(`Script execution failed with code ${code}: ${stderr || 'Unknown error'}`));
        }
      });

      child.on('error', (error) => {
        logger.error({
          message: 'Failed to spawn YouTube metadata script',
          error: error.message
        });
        reject(new Error(`Failed to execute script: ${error.message}`));
      });
    });
  }
}