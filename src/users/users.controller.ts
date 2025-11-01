import { Controller, Get, Post, Put, Patch, Body, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignCoachDto } from './dto/assign-coach.dto';
import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Post('create-profile')
  async createProfile(@Req() req: any, @Body() body: { displayName?: string; phoneNumber?: string }) {
    return this.usersService.createUserProfile(req.user.uid, req.user.email, body.displayName, body.phoneNumber);
  }

  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Post('upload-photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(@UploadedFile() file: any, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('No photo file provided');
    }
    return this.usersService.uploadProfilePhoto(file, req.user.uid);
  }

  @Post(':id/assign-coach')
  async assignCoach(
    @Param('id') id: string,
    @Body() assignCoachDto: AssignCoachDto,
  ) {
    return this.usersService.assignCoach(id, assignCoachDto);
  }

  @Post(':id/ban')
  async banUser(@Param('id') id: string, @Body() body: { banReason?: string }) {
    return this.usersService.banUser(id, body.banReason);
  }

  @Post(':id/unban')
  async unbanUser(@Param('id') id: string) {
    return this.usersService.unbanUser(id);
  }

  @Patch(':id/commission')
  async updateUserCommission(
    @Param('id') id: string,
    @Body() body: { coachCommissionOverride?: number | null },
  ) {
    return this.usersService.updateUserCommission(id, body.coachCommissionOverride);
  }

  @Get(':id/active-subscriptions')
  async getUserActiveSubscriptions(@Param('id') id: string) {
    return this.usersService.getUserActiveSubscriptions(id);
  }

  @Post(':id/delete')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}

