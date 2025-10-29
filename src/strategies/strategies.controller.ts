import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StrategiesService } from './strategies.service';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { StorageService } from '../storage/storage.service';

@Controller('strategies')
@UseGuards(AuthGuard)
export class StrategiesController {
  constructor(
    private readonly strategiesService: StrategiesService,
    private readonly storageService: StorageService,
  ) {}

  @Public()
  @Get()
  async getAllStrategies() {
    return this.strategiesService.getAllStrategies();
  }

  @Public()
  @Get(':id')
  async getStrategyById(@Param('id') id: string) {
    return this.strategiesService.getStrategyById(id);
  }

  @Get(':id/users')
  async getStrategyUsers(@Param('id') id: string) {
    return this.strategiesService.getStrategyUsers(id);
  }

  @Post()
  async createStrategy(@Body() createStrategyDto: CreateStrategyDto) {
    return this.strategiesService.createStrategy(createStrategyDto);
  }

  @Put(':id')
  async updateStrategy(
    @Param('id') id: string,
    @Body() updateStrategyDto: UpdateStrategyDto,
  ) {
    return this.strategiesService.updateStrategy(id, updateStrategyDto);
  }

  @Delete(':id')
  async deleteStrategy(@Param('id') id: string) {
    await this.strategiesService.deleteStrategy(id);
    return { message: 'Strategy deleted successfully' };
  }

  @Post('upload-cover')
  @UseInterceptors(FileInterceptor('cover'))
  async uploadCover(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No cover photo file provided');
    }

    console.log('🔵 [STRATEGIES] Uploading cover photo...');
    console.log('File details:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    });

    const fileName = `cover_${Date.now()}_${file.originalname}`;
    const storagePath = `strategies/covers/${fileName}`;

    const result = await this.storageService.uploadFile(
      file.buffer,
      storagePath,
      file.mimetype,
    );

    console.log('✅ [STRATEGIES] Cover photo uploaded:', result.url);
    return { url: result.url };
  }
}

