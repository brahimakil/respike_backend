import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideosService } from './videos.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { StorageService } from '../../storage/storage.service';
import { BunnyService } from '../../services/bunny.service';

@Controller('strategies/:strategyId/videos')
@UseGuards(AuthGuard)
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly storageService: StorageService,
    private readonly bunnyService: BunnyService,
  ) {}

  @Get()
  async getAllVideos(@Param('strategyId') strategyId: string) {
    // Admin endpoint - requires AuthGuard - returns ALL videos with videoUrl as-is
    console.log('� [VIDEOS CONTROLLER] Admin fetching all videos for strategy:', strategyId);
    return this.videosService.getAllVideos(strategyId);
  }

  @Public()
  @Get(':id')
  async getVideoById(
    @Param('strategyId') strategyId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const userId = req.user?.uid;
    console.log('🔑 [VIDEOS CONTROLLER] User from request:', userId);
    return this.videosService.getVideoByIdForUser(strategyId, id, userId);
  }

  @Post()
  async createVideo(
    @Param('strategyId') strategyId: string,
    @Body() createVideoDto: CreateVideoDto,
  ) {
    return this.videosService.createVideo(strategyId, createVideoDto);
  }

  @Put(':id')
  async updateVideo(
    @Param('strategyId') strategyId: string,
    @Param('id') id: string,
    @Body() updateVideoDto: UpdateVideoDto,
  ) {
    return this.videosService.updateVideo(strategyId, id, updateVideoDto);
  }

  @Patch(':id/reorder')
  async reorderVideo(
    @Param('strategyId') strategyId: string,
    @Param('id') id: string,
    @Body() body: { newOrder: number },
  ) {
    await this.videosService.reorderVideo(strategyId, id, body.newOrder);
    return { message: 'Video reordered successfully' };
  }

  @Patch(':id/visibility')
  async toggleVisibility(
    @Param('strategyId') strategyId: string,
    @Param('id') id: string,
    @Body() body: { isVisible: boolean },
  ) {
    return this.videosService.toggleVisibility(strategyId, id, body.isVisible);
  }

  @Delete(':id')
  async deleteVideo(
    @Param('strategyId') strategyId: string,
    @Param('id') id: string,
  ) {
    await this.videosService.deleteVideo(strategyId, id);
    return { message: 'Video deleted successfully' };
  }

  @Post('upload-video')
  @UseInterceptors(FileInterceptor('video'))
  async uploadVideo(@UploadedFile() file: any, @Param('strategyId') strategyId: string) {
    if (!file) {
      throw new BadRequestException('No video file provided');
    }

    console.log('🔵 [VIDEOS] Uploading video to Bunny.net for strategy:', strategyId);
    console.log('File details:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    });

    // Upload to Bunny.net Stream
    const result = await this.bunnyService.uploadVideo(file.buffer, file.originalname);

    console.log('✅ [VIDEOS] Video uploaded to Bunny.net:', result.playbackUrl);
    return { 
      url: result.playbackUrl,
      videoId: result.videoId,
    };
  }

  @Post('upload-cover')
  @UseInterceptors(FileInterceptor('cover'))
  async uploadCover(@UploadedFile() file: any, @Param('strategyId') strategyId: string) {
    if (!file) {
      throw new BadRequestException('No cover photo file provided');
    }

    console.log('🔵 [VIDEOS] Uploading cover for strategy:', strategyId);

    const fileName = `cover_${Date.now()}_${file.originalname}`;
    const storagePath = `strategies/${strategyId}/videos/covers/${fileName}`;

    const result = await this.storageService.uploadFile(
      file.buffer,
      storagePath,
      file.mimetype,
    );

    console.log('✅ [VIDEOS] Cover uploaded:', result.url);
    return { url: result.url };
  }
}

