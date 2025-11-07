import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class BunnyService {
  private readonly logger = new Logger(BunnyService.name);
  private readonly libraryId: string;
  private readonly apiKey: string;
  private readonly cdnHostname: string;
  private readonly apiBaseUrl = 'https://video.bunnycdn.com';

  constructor(private configService: ConfigService) {
    this.libraryId = this.configService.get<string>('bunny.libraryId') || '';
    this.apiKey = this.configService.get<string>('bunny.apiKey') || '';
    this.cdnHostname = this.configService.get<string>('bunny.cdnHostname') || '';
  }

  /**
   * Upload video to Bunny.net Stream
   * @param videoBuffer - Video file buffer
   * @param title - Video title
   * @returns Video ID and playback URL
   */
  async uploadVideo(videoBuffer: Buffer, title: string): Promise<{ videoId: string; playbackUrl: string }> {
    try {
      this.logger.log(`🚀 Uploading video to Bunny.net: ${title}`);

      // Step 1: Create video object
      const createResponse = await axios.post(
        `${this.apiBaseUrl}/library/${this.libraryId}/videos`,
        { title },
        {
          headers: {
            AccessKey: this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const videoId = createResponse.data.guid;
      this.logger.log(`✅ Video object created with ID: ${videoId}`);

      // Step 2: Upload video file
      await axios.put(
        `${this.apiBaseUrl}/library/${this.libraryId}/videos/${videoId}`,
        videoBuffer,
        {
          headers: {
            AccessKey: this.apiKey,
            'Content-Type': 'application/octet-stream',
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      this.logger.log(`✅ Video file uploaded successfully`);

      // Step 3: Return playback URL
      const playbackUrl = `https://${this.cdnHostname}/${videoId}/playlist.m3u8`;
      
      return {
        videoId,
        playbackUrl,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to upload video to Bunny.net:`, error.response?.data || error.message);
      throw new Error('Failed to upload video to Bunny.net');
    }
  }

  /**
   * Delete video from Bunny.net Stream
   * @param videoId - Bunny.net video ID
   */
  async deleteVideo(videoId: string): Promise<void> {
    try {
      this.logger.log(`🗑️ Deleting video from Bunny.net: ${videoId}`);

      await axios.delete(
        `${this.apiBaseUrl}/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            AccessKey: this.apiKey,
          },
        }
      );

      this.logger.log(`✅ Video deleted successfully`);
    } catch (error) {
      this.logger.error(`❌ Failed to delete video from Bunny.net:`, error.response?.data || error.message);
      throw new Error('Failed to delete video from Bunny.net');
    }
  }

  /**
   * Get video details from Bunny.net
   * @param videoId - Bunny.net video ID
   */
  async getVideoDetails(videoId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.apiBaseUrl}/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            AccessKey: this.apiKey,
          },
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`❌ Failed to get video details:`, error.response?.data || error.message);
      throw new Error('Failed to get video details from Bunny.net');
    }
  }

  /**
   * Get playback URL for a video
   * @param videoId - Bunny.net video ID
   * @returns HLS playlist URL
   */
  getPlaybackUrl(videoId: string): string {
    return `https://${this.cdnHostname}/${videoId}/playlist.m3u8`;
  }

  /**
   * Get thumbnail URL for a video
   * @param videoId - Bunny.net video ID
   * @returns Thumbnail URL
   */
  getThumbnailUrl(videoId: string): string {
    return `https://${this.cdnHostname}/${videoId}/thumbnail.jpg`;
  }
}
