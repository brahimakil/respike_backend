import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CoachesService } from './coaches.service';
import { CreateCoachDto } from './dto/create-coach.dto';
import { UpdateCoachDto } from './dto/update-coach.dto';
import { ReviewCoachDto } from './dto/review-coach.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('coaches')
@UseGuards(AuthGuard)
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'profilePhoto', maxCount: 1 },
      { name: 'idFrontPhoto', maxCount: 1 },
      { name: 'idBackPhoto', maxCount: 1 },
    ]),
  )
  async createCoach(
    @Body() createCoachDto: CreateCoachDto,
    @UploadedFiles()
    files: {
      profilePhoto?: any[];
      idFrontPhoto?: any[];
      idBackPhoto?: any[];
    },
  ) {
    // Validate that all required files are uploaded
    if (
      !files.profilePhoto ||
      !files.idFrontPhoto ||
      !files.idBackPhoto
    ) {
      throw new BadRequestException(
        'All photos are required: profilePhoto, idFrontPhoto, idBackPhoto',
      );
    }

    return this.coachesService.createCoach(createCoachDto, {
      profilePhoto: files.profilePhoto[0],
      idFrontPhoto: files.idFrontPhoto[0],
      idBackPhoto: files.idBackPhoto[0],
    });
  }

  @Get()
  async getAllCoaches() {
    return this.coachesService.getAllCoaches();
  }

  @Get(':id/active-users')
  async getCoachActiveUsers(@Param('id') id: string) {
    return this.coachesService.getCoachActiveUsers(id);
  }

  @Get(':id')
  async getCoachById(@Param('id') id: string) {
    return this.coachesService.getCoachById(id);
  }

  @Put(':id')
  async updateCoach(
    @Param('id') id: string,
    @Body() updateCoachDto: UpdateCoachDto,
  ) {
    return this.coachesService.updateCoach(id, updateCoachDto);
  }

  @Post(':id/review')
  async reviewCoach(
    @Param('id') id: string,
    @Body() reviewDto: ReviewCoachDto,
    @Request() req: any,
  ) {
    const adminId = req.user.uid; // From AuthGuard
    return this.coachesService.reviewCoach(id, reviewDto, adminId);
  }

  @Post(':id/ban')
  async banCoach(
    @Param('id') id: string,
    @Request() req: any,
    @Body() body: { banReason?: string },
  ) {
    const adminId = req.user.uid;
    return this.coachesService.banCoach(id, adminId, body.banReason);
  }

  @Post(':id/unban')
  async unbanCoach(@Param('id') id: string, @Request() req: any) {
    const adminId = req.user.uid;
    return this.coachesService.unbanCoach(id, adminId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCoach(@Param('id') id: string) {
    await this.coachesService.deleteCoach(id);
  }
}

